import { decodeEventLog, decodeFunctionData, parseAbi, type Hex } from "viem";
import { rogueReputationAbi, ROGUE_REPUTATION_ADDRESS } from "../contracts/rogueReputation";
import type { LogEntry } from "../types";

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 value) returns (bool)",
  "function approve(address spender, uint256 value) returns (bool)",
  "function transferFrom(address from, address to, uint256 value) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
]);

const ERC721_ABI = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function safeTransferFrom(address from, address to, uint256 tokenId)",
  "function safeTransferFrom(address from, address to, uint256 tokenId, bytes data)",
  "function setApprovalForAll(address operator, bool approved)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId)",
  "event ApprovalForAll(address indexed owner, address indexed operator, bool approved)",
]);

const ERC1155_ABI = parseAbi([
  "function uri(uint256 id) view returns (string)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data)",
  "function safeBatchTransferFrom(address from, address to, uint256[] ids, uint256[] values, bytes data)",
  "event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)",
  "event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values)",
  "event ApprovalForAll(address indexed account, address indexed operator, bool approved)",
]);

export interface DecodedFunctionCall {
  standard: "RogueReputation" | "ERC20" | "ERC721" | "ERC1155";
  functionName: string;
  args: string[];
}

export interface DecodedEventLog {
  standard: "ERC20" | "ERC721" | "ERC1155";
  eventName: string;
  args: Record<string, string>;
}

export interface BlockRewardBreakdown {
  era: number;
  totalRewardRogue: number;
  minerRewardRogue: number;
  treasuryRewardRogue: number;
}

export interface OnChainNftMetadata {
  name?: string;
  description?: string;
  image?: string;
  isOnChainImage: boolean;
  rawUri: string;
}

const ERA_BLOCKS = 2_000_000;
const INITIAL_REWARD_ROGUE = 25;
const MAX_ERAS = 32;

/** Computes Rogue Signal block reward and 95% / 5% split for a given block height. */
export function getBlockRewardBreakdown(blockNumber: number): BlockRewardBreakdown {
  if (blockNumber <= 0) {
    return { era: 0, totalRewardRogue: 0, minerRewardRogue: 0, treasuryRewardRogue: 0 };
  }
  const era = Math.floor((blockNumber - 1) / ERA_BLOCKS);
  if (era >= MAX_ERAS) {
    return { era, totalRewardRogue: 0, minerRewardRogue: 0, treasuryRewardRogue: 0 };
  }
  const totalRewardRogue = INITIAL_REWARD_ROGUE / Math.pow(2, era);
  const minerRewardRogue = totalRewardRogue * 0.95;
  const treasuryRewardRogue = totalRewardRogue * 0.05;
  return { era, totalRewardRogue, minerRewardRogue, treasuryRewardRogue };
}

/** Decodes hex extraData into a printable UTF-8 string if valid, otherwise returns null. */
export function decodeExtraDataUtf8(hex?: string): string | null {
  if (!hex || hex === "0x" || hex.length < 4) return null;
  try {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length % 2 !== 0) return null;
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < clean.length; i += 2) {
      bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
    }
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/\0+$/g, "");
    if (!decoded || !/^[\x20-\x7E\u00A0-\u024F\s]+$/.test(decoded)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

/** Formats a wei hex or bigint string into a human-readable ROGUE amount. */
export function formatWeiValue(weiInput: string | bigint | undefined, maxDecimals: number = 6): string {
  if (weiInput === undefined || weiInput === null) return "0";
  try {
    const wei = typeof weiInput === "bigint" ? weiInput : BigInt(weiInput || "0x0");
    return formatTokenAmount(wei, 18, maxDecimals);
  } catch {
    return "0";
  }
}

/** Formats an arbitrary token amount with given decimals, trimming trailing zeros. */
export function formatTokenAmount(rawAmount: bigint, decimals: number, maxFractionDigits: number = 6): string {
  if (decimals <= 0) return rawAmount.toString();
  const base = 10n ** BigInt(decimals);
  const whole = rawAmount / base;
  const rem = rawAmount % base;
  if (rem === 0n) return whole.toLocaleString();
  const padded = rem.toString().padStart(decimals, "0").slice(0, maxFractionDigits).replace(/0+$/, "");
  return padded ? `${whole.toLocaleString()}.${padded}` : whole.toLocaleString();
}

function stringifyDecodedValue(val: unknown): string {
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val)) return `[${val.map(stringifyDecodedValue).join(", ")}]`;
  if (val === null || val === undefined) return "";
  return String(val);
}

/** Attempts to decode transaction input calldata against known Rogue Signal & token ABIs. */
export function decodeTransactionInput(dataHex?: string, to?: string | null): DecodedFunctionCall | null {
  if (!dataHex || dataHex === "0x" || dataHex.length < 10) return null;
  const data = dataHex as Hex;

  if (to && to.toLowerCase() === ROGUE_REPUTATION_ADDRESS.toLowerCase()) {
    try {
      const decoded = decodeFunctionData({ abi: rogueReputationAbi, data });
      return {
        standard: "RogueReputation",
        functionName: decoded.functionName,
        args: (decoded.args || []).map(stringifyDecodedValue),
      };
    } catch {
      // Fall through to generic ABIs
    }
  }

  const candidates: Array<{ standard: "ERC20" | "ERC721" | "ERC1155"; abi: readonly unknown[] }> = [
    { standard: "ERC20", abi: ERC20_ABI },
    { standard: "ERC721", abi: ERC721_ABI },
    { standard: "ERC1155", abi: ERC1155_ABI },
  ];

  for (const candidate of candidates) {
    try {
      const decoded = decodeFunctionData({ abi: candidate.abi as typeof ERC20_ABI, data });
      return {
        standard: candidate.standard,
        functionName: decoded.functionName,
        args: (decoded.args || []).map(stringifyDecodedValue),
      };
    } catch {
      // Try next ABI
    }
  }
  return null;
}

/** Attempts to decode an EVM event log against ERC-20, ERC-721, and ERC-1155 event signatures. */
export function decodeEventLogEntry(log: LogEntry): DecodedEventLog | null {
  if (!log.topics || log.topics.length === 0) return null;
  const topics = log.topics as [Hex, ...Hex[]];
  const data = (log.data || "0x") as Hex;

  // Distinguish ERC-721 Transfer (4 topics: sig, from, to, tokenId) vs ERC-20 Transfer (3 topics)
  const candidates: Array<{ standard: "ERC20" | "ERC721" | "ERC1155"; abi: readonly unknown[] }> =
    topics.length === 4
      ? [
          { standard: "ERC721", abi: ERC721_ABI },
          { standard: "ERC1155", abi: ERC1155_ABI },
          { standard: "ERC20", abi: ERC20_ABI },
        ]
      : [
          { standard: "ERC20", abi: ERC20_ABI },
          { standard: "ERC1155", abi: ERC1155_ABI },
          { standard: "ERC721", abi: ERC721_ABI },
        ];

  for (const candidate of candidates) {
    try {
      const decoded = decodeEventLog({
        abi: candidate.abi as typeof ERC20_ABI,
        data,
        topics,
      });
      const argsObj: Record<string, string> = {};
      if (decoded.args && typeof decoded.args === "object") {
        for (const [k, v] of Object.entries(decoded.args)) {
          argsObj[k] = stringifyDecodedValue(v);
        }
      }
      return {
        standard: candidate.standard,
        eventName: decoded.eventName || "Event",
        args: argsObj,
      };
    } catch {
      // Try next ABI
    }
  }
  return null;
}

/**
 * Parses on-chain NFT tokenURI metadata (data:application/json;base64,... or utf8)
 * without performing any external HTTP/IPFS requests.
 */
export function parseOnChainTokenUri(uri?: string): OnChainNftMetadata | null {
  if (!uri) return null;
  const trimmed = uri.trim();
  if (!trimmed) return null;

  let jsonText: string | null = null;
  if (trimmed.startsWith("data:application/json;base64,")) {
    try {
      const b64 = trimmed.slice("data:application/json;base64,".length);
      jsonText = atob(b64);
    } catch {
      jsonText = null;
    }
  } else if (trimmed.startsWith("data:application/json;utf8,")) {
    try {
      jsonText = decodeURIComponent(trimmed.slice("data:application/json;utf8,".length));
    } catch {
      jsonText = trimmed.slice("data:application/json;utf8,".length);
    }
  } else if (trimmed.startsWith("data:application/json,")) {
    try {
      jsonText = decodeURIComponent(trimmed.slice("data:application/json,".length));
    } catch {
      jsonText = trimmed.slice("data:application/json,".length);
    }
  }

  if (!jsonText) {
    return {
      isOnChainImage: trimmed.startsWith("data:image/"),
      image: trimmed.startsWith("data:image/") ? trimmed : undefined,
      rawUri: trimmed,
    };
  }

  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const image = typeof parsed.image === "string" ? parsed.image : undefined;
    const isOnChainImage = Boolean(image && image.startsWith("data:image/"));
    return {
      name: typeof parsed.name === "string" ? parsed.name : undefined,
      description: typeof parsed.description === "string" ? parsed.description : undefined,
      image,
      isOnChainImage,
      rawUri: trimmed,
    };
  } catch {
    return {
      isOnChainImage: false,
      rawUri: trimmed,
    };
  }
}

