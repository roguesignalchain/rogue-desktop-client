import { createPublicClient, custom, pad, parseAbi, type Address, type Hex } from "viem";
import { rogueSignalChain } from "../contracts/rogueReputation";
import { api } from "./api";
import type {
  BlockWithTransactions,
  LogEntry,
  NftItem,
  RpcTransaction,
  TokenBalance,
  TokenTransferEvent,
} from "../types";
import { formatTokenAmount, parseOnChainTokenUri } from "../utils/explorerDecode";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TRANSFER_SINGLE_TOPIC = "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62";

const ERC20_READ_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address owner) view returns (uint256)",
]);

const ERC721_READ_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
]);

const ERC1155_READ_ABI = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function uri(uint256 id) view returns (string)",
]);

function getViemClient(rpcUrl: string) {
  return createPublicClient({
    chain: rogueSignalChain,
    transport: custom({
      async request({ method, params }) {
        return api.callRpc(rpcUrl, method, Array.isArray(params) ? params : []);
      },
    }),
  });
}

export interface AddressTxItem {
  tx: RpcTransaction;
  blockNumber: number;
  timestamp: number;
  direction: "in" | "out" | "self";
}

export interface AddressScanResult {
  transactions: AddressTxItem[];
  minedBlocks: number;
  scannedBlocks: number;
}

/**
 * Scans a block range in memory for native transactions involving `address`.
 * Supports cancellation via AbortSignal and progress callbacks.
 */
export async function scanAddressTransactions(params: {
  rpcUrl: string;
  address: string;
  fromBlock: number;
  toBlock: number;
  signal?: AbortSignal;
  onProgress?: (scanned: number, total: number) => void;
}): Promise<AddressScanResult> {
  const { rpcUrl, address, fromBlock, toBlock, signal, onProgress } = params;
  const target = address.toLowerCase();
  const start = Math.max(0, fromBlock);
  const end = Math.max(start, toBlock);
  const total = end - start + 1;
  const batchSize = 15;

  const transactions: AddressTxItem[] = [];
  let minedBlocks = 0;
  let scanned = 0;

  for (let cursor = end; cursor >= start; cursor -= batchSize) {
    if (signal?.aborted) break;
    const heights: number[] = [];
    for (let i = 0; i < batchSize && cursor - i >= start; i++) {
      heights.push(cursor - i);
    }

    const blocks = await Promise.all(
      heights.map((h) =>
        api.getBlockByNumber(rpcUrl, h, true).catch(() => null)
      )
    );

    for (const raw of blocks) {
      if (!raw) continue;
      const blk = raw as BlockWithTransactions;
      const blkNum = parseInt(blk.number, 16);
      const blkTs = parseInt(blk.timestamp, 16);
      if (blk.miner?.toLowerCase() === target) {
        minedBlocks++;
      }
      if (Array.isArray(blk.transactions)) {
        for (const tx of blk.transactions) {
          if (typeof tx === "string") continue;
          const fromMatch = tx.from?.toLowerCase() === target;
          const toMatch = tx.to?.toLowerCase() === target;
          if (fromMatch || toMatch) {
            transactions.push({
              tx,
              blockNumber: blkNum,
              timestamp: blkTs,
              direction: fromMatch && toMatch ? "self" : fromMatch ? "out" : "in",
            });
          }
        }
      }
    }

    scanned += heights.length;
    onProgress?.(Math.min(scanned, total), total);
  }

  transactions.sort((a, b) => b.blockNumber - a.blockNumber);
  return { transactions, minedBlocks, scannedBlocks: scanned };
}

export interface TokenDiscoveryResult {
  erc20Balances: TokenBalance[];
  transfers: TokenTransferEvent[];
  nfts: NftItem[];
}

/**
 * Discovers ERC-20, ERC-721, and ERC-1155 tokens for `address` via eth_getLogs
 * plus any user-provided custom token contract addresses.
 */
export async function discoverAddressTokensAndNfts(params: {
  rpcUrl: string;
  address: string;
  fromBlock: number;
  toBlock: number;
  customContracts?: string[];
}): Promise<TokenDiscoveryResult> {
  const { rpcUrl, address, fromBlock, toBlock, customContracts = [] } = params;
  const userAddr = address.toLowerCase() as Address;
  const paddedAddr = pad(userAddr, { size: 32 });
  const fromHex = "0x" + Math.max(0, fromBlock).toString(16);
  const toHex = "0x" + Math.max(0, toBlock).toString(16);

  const [sentLogs, recvLogs, singleSentLogs, singleRecvLogs] = await Promise.all([
    api.getLogs(rpcUrl, { fromBlock: fromHex, toBlock: toHex, topics: [TRANSFER_TOPIC, paddedAddr] }).catch(() => []),
    api.getLogs(rpcUrl, { fromBlock: fromHex, toBlock: toHex, topics: [TRANSFER_TOPIC, null, paddedAddr] }).catch(() => []),
    api.getLogs(rpcUrl, { fromBlock: fromHex, toBlock: toHex, topics: [TRANSFER_SINGLE_TOPIC, null, paddedAddr] }).catch(() => []),
    api.getLogs(rpcUrl, { fromBlock: fromHex, toBlock: toHex, topics: [TRANSFER_SINGLE_TOPIC, null, null, paddedAddr] }).catch(() => []),
  ]);

  const seenLogKeys = new Set<string>();
  const allLogs: LogEntry[] = [];
  for (const log of [...sentLogs, ...recvLogs, ...singleSentLogs, ...singleRecvLogs]) {
    const key = `${log.transactionHash}-${log.logIndex}`;
    if (!seenLogKeys.has(key)) {
      seenLogKeys.add(key);
      allLogs.push(log);
    }
  }

  const erc20Contracts = new Set<string>(customContracts.map((c) => c.toLowerCase()));
  const erc721Candidates = new Map<string, Set<string>>();
  const erc1155Candidates = new Map<string, Set<string>>();
  const transfers: TokenTransferEvent[] = [];

  for (const log of allLogs) {
    const contract = log.address.toLowerCase();
    const blockNumber = parseInt(log.blockNumber, 16);
    const logIndex = parseInt(log.logIndex, 16);
    const topic0 = log.topics[0]?.toLowerCase();

    if (topic0 === TRANSFER_TOPIC) {
      const from = log.topics[1] ? `0x${log.topics[1].slice(26)}`.toLowerCase() : "0x0000000000000000000000000000000000000000";
      const to = log.topics[2] ? `0x${log.topics[2].slice(26)}`.toLowerCase() : "0x0000000000000000000000000000000000000000";

      if (log.topics.length === 4 && log.topics[3]) {
        // ERC-721 Transfer
        const tokenId = BigInt(log.topics[3]).toString();
        if (!erc721Candidates.has(contract)) erc721Candidates.set(contract, new Set());
        erc721Candidates.get(contract)!.add(tokenId);
        transfers.push({
          transactionHash: log.transactionHash,
          blockNumber,
          logIndex,
          contractAddress: contract,
          standard: "ERC721",
          from,
          to,
          value: "1",
          tokenId,
        });
      } else {
        // ERC-20 Transfer
        erc20Contracts.add(contract);
        const rawVal = log.data && log.data !== "0x" ? BigInt(log.data).toString() : "0";
        transfers.push({
          transactionHash: log.transactionHash,
          blockNumber,
          logIndex,
          contractAddress: contract,
          standard: "ERC20",
          from,
          to,
          value: rawVal,
        });
      }
    } else if (topic0 === TRANSFER_SINGLE_TOPIC && log.topics.length >= 4) {
      const from = `0x${log.topics[2].slice(26)}`.toLowerCase();
      const to = `0x${log.topics[3].slice(26)}`.toLowerCase();
      const cleanData = (log.data || "0x").replace(/^0x/, "");
      if (cleanData.length >= 128) {
        const tokenId = BigInt("0x" + cleanData.slice(0, 64)).toString();
        const val = BigInt("0x" + cleanData.slice(64, 128)).toString();
        if (!erc1155Candidates.has(contract)) erc1155Candidates.set(contract, new Set());
        erc1155Candidates.get(contract)!.add(tokenId);
        transfers.push({
          transactionHash: log.transactionHash,
          blockNumber,
          logIndex,
          contractAddress: contract,
          standard: "ERC1155",
          from,
          to,
          value: val,
          tokenId,
        });
      }
    }
  }

  const client = getViemClient(rpcUrl);

  // Query ERC-20 balances & metadata
  const customSet = new Set(customContracts.map((c) => c.toLowerCase()));
  const erc20Balances: TokenBalance[] = [];
  await Promise.all(
    Array.from(erc20Contracts).map(async (contract) => {
      try {
        const addr = contract as Address;
        const [rawBal, name, symbol, decimals] = await Promise.all([
          client.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "balanceOf", args: [userAddr] }),
          client.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "name" }).catch(() => "Unknown Token"),
          client.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "symbol" }).catch(() => "TOKEN"),
          client.readContract({ address: addr, abi: ERC20_READ_ABI, functionName: "decimals" }).catch(() => 18),
        ]);
        const decNum = Number(decimals);
        erc20Balances.push({
          contractAddress: contract,
          standard: "ERC20",
          name: String(name),
          symbol: String(symbol),
          decimals: decNum,
          rawBalance: rawBal.toString(),
          formattedBalance: formatTokenAmount(rawBal, decNum, 6),
          isCustom: customSet.has(contract),
        });
      } catch {
        // Not a standard ERC-20 or contract call failed
      }
    })
  );

  // Enrich transfer symbols/decimals
  const metaByContract = new Map(erc20Balances.map((b) => [b.contractAddress.toLowerCase(), b]));
  for (const tr of transfers) {
    const meta = metaByContract.get(tr.contractAddress.toLowerCase());
    if (meta) {
      tr.symbol = meta.symbol;
      tr.decimals = meta.decimals;
    }
  }
  transfers.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex);

  // Query ERC-721 owned NFTs
  const nfts: NftItem[] = [];
  for (const [contract, tokenIds] of erc721Candidates.entries()) {
    const addr = contract as Address;
    const [colName, colSymbol] = await Promise.all([
      client.readContract({ address: addr, abi: ERC721_READ_ABI, functionName: "name" }).catch(() => undefined),
      client.readContract({ address: addr, abi: ERC721_READ_ABI, functionName: "symbol" }).catch(() => undefined),
    ]);

    await Promise.all(
      Array.from(tokenIds).map(async (tokenId) => {
        try {
          const owner = await client.readContract({
            address: addr,
            abi: ERC721_READ_ABI,
            functionName: "ownerOf",
            args: [BigInt(tokenId)],
          });
          if (owner.toLowerCase() !== userAddr) return;
          const rawUri = await client
            .readContract({
              address: addr,
              abi: ERC721_READ_ABI,
              functionName: "tokenURI",
              args: [BigInt(tokenId)],
            })
            .catch(() => "");
          const parsed = parseOnChainTokenUri(rawUri);
          nfts.push({
            contractAddress: contract,
            standard: "ERC721",
            tokenId,
            balance: "1",
            name: colName ? String(colName) : undefined,
            symbol: colSymbol ? String(colSymbol) : undefined,
            tokenUri: rawUri || undefined,
            metadataName: parsed?.name,
            metadataDescription: parsed?.description,
            imageUri: parsed?.isOnChainImage ? parsed.image : undefined,
          });
        } catch {
          // Token burned or non-standard ownerOf
        }
      })
    );
  }

  // Query ERC-1155 owned NFTs
  for (const [contract, tokenIds] of erc1155Candidates.entries()) {
    const addr = contract as Address;
    await Promise.all(
      Array.from(tokenIds).map(async (tokenId) => {
        try {
          const bal = await client.readContract({
            address: addr,
            abi: ERC1155_READ_ABI,
            functionName: "balanceOf",
            args: [userAddr, BigInt(tokenId)],
          });
          if (bal <= 0n) return;
          const rawUri = await client
            .readContract({
              address: addr,
              abi: ERC1155_READ_ABI,
              functionName: "uri",
              args: [BigInt(tokenId)],
            })
            .catch(() => "");
          const resolvedUri = rawUri
            ? rawUri.replace("{id}", (BigInt(tokenId).toString(16) as Hex).padStart(64, "0"))
            : "";
          const parsed = parseOnChainTokenUri(resolvedUri);
          nfts.push({
            contractAddress: contract,
            standard: "ERC1155",
            tokenId,
            balance: bal.toString(),
            tokenUri: resolvedUri || undefined,
            metadataName: parsed?.name,
            metadataDescription: parsed?.description,
            imageUri: parsed?.isOnChainImage ? parsed.image : undefined,
          });
        } catch {
          // Non-standard ERC-1155
        }
      })
    );
  }

  return { erc20Balances, transfers, nfts };
}

