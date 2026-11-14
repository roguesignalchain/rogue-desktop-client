import React, { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  User,
  Code2,
  Coins,
  Image as ImageIcon,
  ArrowRightLeft,
  Award,
  Plus,
  Trash2,
  Search,
  Square,
} from "lucide-react";
import { api } from "../../services/api";
import {
  discoverAddressTokensAndNfts,
  scanAddressTransactions,
  type AddressTxItem,
} from "../../services/explorerScanner";
import type {
  ExplorerRoute,
  MinerGamificationStats,
  NftItem,
  TokenBalance,
  TokenTransferEvent,
} from "../../types";
import { formatTokenAmount, formatWeiValue } from "../../utils/explorerDecode";
import { CopyButton } from "./CopyButton";

interface AddressDetailViewProps {
  rpcUrl: string;
  address: string;
  onNavigate: (route: ExplorerRoute) => void;
  onBack: () => void;
}

const CUSTOM_TOKENS_STORAGE_KEY = "rogue_explorer_custom_tokens";

function loadCustomTokens(): string[] {
  try {
    const raw = localStorage.getItem(CUSTOM_TOKENS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export const AddressDetailView: React.FC<AddressDetailViewProps> = ({
  rpcUrl,
  address,
  onNavigate,
  onBack,
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<"txs" | "erc20" | "nfts">("txs");

  // Overview state
  const [balanceWei, setBalanceWei] = useState<bigint>(0n);
  const [nonce, setNonce] = useState<number>(0);
  const [isContract, setIsContract] = useState<boolean>(false);
  const [minerStats, setMinerStats] = useState<MinerGamificationStats | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(true);

  // Scanner state
  const [scanWindow, setScanWindow] = useState<number>(1000);
  const [scanning, setScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{ scanned: number; total: number } | null>(null);
  const [txs, setTxs] = useState<AddressTxItem[]>([]);
  const [minedInRange, setMinedInRange] = useState<number>(0);
  const [lastScannedRange, setLastScannedRange] = useState<{ from: number; to: number } | null>(null);

  // Token & NFT state
  const [erc20Balances, setErc20Balances] = useState<TokenBalance[]>([]);
  const [tokenTransfers, setTokenTransfers] = useState<TokenTransferEvent[]>([]);
  const [nfts, setNfts] = useState<NftItem[]>([]);
  const [loadingTokens, setLoadingTokens] = useState<boolean>(false);
  const [customTokens, setCustomTokens] = useState<string[]>(loadCustomTokens);
  const [newTokenInput, setNewTokenInput] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);

  // Load address overview & discover tokens in recent window
  useEffect(() => {
    let cancelled = false;
    abortRef.current?.abort();

    const loadOverview = async () => {
      setLoadingOverview(true);
      try {
        const [bal, txCount, code, stats, latestHeight] = await Promise.all([
          api.getBalanceWei(rpcUrl, address),
          api.getTransactionCount(rpcUrl, address),
          api.getCode(rpcUrl, address),
          api.getMinerStats(rpcUrl, address, i18n.language).catch(() => null),
          api.getBlockNumber(rpcUrl).catch(() => 0),
        ]);
        if (cancelled) return;
        setBalanceWei(bal);
        setNonce(txCount);
        setIsContract(code !== "0x" && code.length > 2);
        setMinerStats(stats);

        // Fast log discovery on recent window
        setLoadingTokens(true);
        const fromBlock = Math.max(0, latestHeight - scanWindow);
        const tokenRes = await discoverAddressTokensAndNfts({
          rpcUrl,
          address,
          fromBlock,
          toBlock: latestHeight,
          customContracts: customTokens,
        });
        if (!cancelled) {
          setErc20Balances(tokenRes.erc20Balances);
          setTokenTransfers(tokenRes.transfers);
          setNfts(tokenRes.nfts);
        }
      } catch {
        // RPC error
      } finally {
        if (!cancelled) {
          setLoadingOverview(false);
          setLoadingTokens(false);
        }
      }
    };

    loadOverview();
    return () => {
      cancelled = true;
      abortRef.current?.abort();
    };
  }, [rpcUrl, address, i18n.language, customTokens, scanWindow]);

  const handleRunTxScan = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setScanning(true);
    setScanProgress({ scanned: 0, total: scanWindow });
    try {
      const latest = await api.getBlockNumber(rpcUrl);
      const from = Math.max(0, latest - scanWindow + 1);
      const res = await scanAddressTransactions({
        rpcUrl,
        address,
        fromBlock: from,
        toBlock: latest,
        signal: controller.signal,
        onProgress: (scanned, total) => setScanProgress({ scanned, total }),
      });
      setTxs(res.transactions);
      setMinedInRange(res.minedBlocks);
      setLastScannedRange({ from, to: latest });
    } finally {
      setScanning(false);
    }
  };

  const handleCancelScan = () => {
    abortRef.current?.abort();
    setScanning(false);
  };

  const handleAddCustomToken = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTokenInput.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(trimmed)) return;
    const lower = trimmed.toLowerCase();
    if (!customTokens.includes(lower)) {
      const updated = [...customTokens, lower];
      setCustomTokens(updated);
      try {
        localStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Storage unavailable
      }
    }
    setNewTokenInput("");
  };

  const handleRemoveCustomToken = (contract: string) => {
    const updated = customTokens.filter((c) => c !== contract.toLowerCase());
    setCustomTokens(updated);
    try {
      localStorage.setItem(CUSTOM_TOKENS_STORAGE_KEY, JSON.stringify(updated));
    } catch {
      // Storage unavailable
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
        <div className="flex items-center space-x-3 min-w-0">
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-[2px] text-xs font-mono transition shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("explorer.back", "Back")}</span>
          </button>
          <div className="flex items-center space-x-2 min-w-0">
            {isContract ? (
              <Code2 className="w-4 h-4 text-sky-400 shrink-0" />
            ) : (
              <User className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span className="text-sm font-bold font-mono text-white truncate">{address}</span>
            <CopyButton text={address} />
          </div>
        </div>

        <span
          className={`px-2 py-0.5 text-[11px] font-mono rounded-[2px] border ${
            isContract
              ? "bg-sky-950/40 border-sky-800/60 text-sky-300"
              : "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
          }`}
        >
          {isContract ? "Smart Contract" : "EOA Account"}
        </span>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500">
            {t("common.balance", "Balance")}
          </div>
          <div className="text-base font-bold font-mono text-white mt-1">
            {loadingOverview ? "..." : `${formatWeiValue(balanceWei, 6)} ROGUE`}
          </div>
          <div className="text-[11px] font-mono text-zinc-400 mt-1">
            Nonce (Tx Count): {nonce.toLocaleString()}
          </div>
        </div>

        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500">
            {t("explorer.tokensAndNfts", "Discovered Assets")}
          </div>
          <div className="text-base font-bold font-mono text-white mt-1">
            {erc20Balances.length} ERC-20 • {nfts.length} NFTs
          </div>
          <div className="text-[11px] font-mono text-zinc-400 mt-1">
            {tokenTransfers.length} {t("explorer.tokenTransferEvents", "transfer events in window")}
          </div>
        </div>

        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span>{t("explorer.minerReputation", "Miner Reputation (0x...0020)")}</span>
          </div>
          {minerStats ? (
            <>
              <div className="text-sm font-bold font-mono text-white mt-1">
                Lv.{minerStats.level} • {minerStats.title}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
                {minerStats.blocksMined.toLocaleString()} blocks mined ({minerStats.progressPercent}%)
              </div>
            </>
          ) : (
            <div className="text-xs font-mono text-zinc-500 mt-1">Unranked Runner (0 blocks)</div>
          )}
        </div>
      </div>

      {/* Tabs + Range Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center space-x-2 font-mono text-xs">
          <button
            onClick={() => setActiveTab("txs")}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-[2px] transition ${
              activeTab === "txs"
                ? "bg-white text-black font-bold"
                : "bg-zinc-900/60 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>
              {t("explorer.tabTransactions", "Transactions")} ({txs.length})
            </span>
          </button>

          <button
            onClick={() => setActiveTab("erc20")}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-[2px] transition ${
              activeTab === "erc20"
                ? "bg-white text-black font-bold"
                : "bg-zinc-900/60 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            <Coins className="w-3.5 h-3.5" />
            <span>ERC-20 ({erc20Balances.length})</span>
          </button>

          <button
            onClick={() => setActiveTab("nfts")}
            className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-[2px] transition ${
              activeTab === "nfts"
                ? "bg-white text-black font-bold"
                : "bg-zinc-900/60 text-zinc-400 hover:text-white border border-zinc-800"
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>NFTs ({nfts.length})</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 font-mono text-xs">
          <span className="text-zinc-500 text-[11px]">
            {t("explorer.scanWindow", "Window:")}
          </span>
          <select
            value={scanWindow}
            disabled={scanning}
            onChange={(e) => setScanWindow(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 text-zinc-200 rounded-[2px] px-2 py-1 text-xs outline-none"
          >
            <option value={500}>500 blocks</option>
            <option value={1000}>1,000 blocks</option>
            <option value={5000}>5,000 blocks</option>
            <option value={10000}>10,000 blocks</option>
          </select>
        </div>
      </div>

      {/* Tab 1: Transactions */}
      {activeTab === "txs" && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
          <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono text-zinc-400">
              {lastScannedRange
                ? `Scanned #${lastScannedRange.from.toLocaleString()} – #${lastScannedRange.to.toLocaleString()} (${minedInRange} mined)`
                : t(
                    "explorer.scanPrompt",
                    "Run an in-memory RPC scan to find native transactions in the selected block window."
                  )}
            </div>
            {scanning ? (
              <button
                onClick={handleCancelScan}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-900/60 hover:bg-red-800 text-white rounded-[2px] text-xs font-mono transition"
              >
                <Square className="w-3 h-3" />
                <span>
                  Cancel ({scanProgress?.scanned ?? 0}/{scanProgress?.total ?? scanWindow})
                </span>
              </button>
            ) : (
              <button
                onClick={handleRunTxScan}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold rounded-[2px] text-xs font-mono transition"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{t("explorer.scanTransactions", "Scan Transactions")}</span>
              </button>
            )}
          </div>

          {txs.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-zinc-500">
              {lastScannedRange
                ? t("explorer.noTxsInRange", "No native transactions found in this block range.")
                : t("explorer.clickScanToStart", "Click 'Scan Transactions' to inspect recent blocks.")}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60 font-mono text-xs">
              {txs.map((item) => (
                <div
                  key={item.tx.hash}
                  onClick={() => onNavigate({ view: "tx", hash: item.tx.hash })}
                  className="p-4 hover:bg-zinc-900/60 cursor-pointer transition space-y-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span
                        className={`px-1.5 py-0.5 text-[10px] rounded-[2px] uppercase ${
                          item.direction === "in"
                            ? "bg-emerald-950/60 text-emerald-400 border border-emerald-800/60"
                            : item.direction === "out"
                              ? "bg-amber-950/60 text-amber-300 border border-amber-800/60"
                              : "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {item.direction}
                      </span>
                      <span className="text-sky-400 hover:underline truncate max-w-[260px] md:max-w-[400px]">
                        {item.tx.hash}
                      </span>
                    </div>
                    <span className="text-white font-bold">
                      {formatWeiValue(item.tx.value, 6)} ROGUE
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-500">
                    <span>
                      Block #{item.blockNumber.toLocaleString()} •{" "}
                      {new Date(item.timestamp * 1000).toLocaleString()}
                    </span>
                    <span className="text-zinc-400">
                      {item.direction === "in"
                        ? `From ${item.tx.from.slice(0, 10)}...`
                        : item.tx.to
                          ? `To ${item.tx.to.slice(0, 10)}...`
                          : "Contract Creation"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: ERC-20 Tokens */}
      {activeTab === "erc20" && (
        <div className="space-y-4">
          {/* Add custom ERC-20 contract */}
          <form
            onSubmit={handleAddCustomToken}
            className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px] flex flex-wrap gap-2"
          >
            <input
              type="text"
              value={newTokenInput}
              onChange={(e) => setNewTokenInput(e.target.value)}
              placeholder={t("explorer.addTokenPlaceholder", "Add custom ERC-20 contract (0x...)")}
              className="flex-1 min-w-[220px] bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none"
            />
            <button
              type="submit"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-[2px] text-xs font-mono transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t("explorer.addToken", "Track Token")}</span>
            </button>
          </form>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider">
              {t("explorer.erc20Balances", "ERC-20 Token Balances")}
            </div>
            {loadingTokens ? (
              <div className="p-6 text-center text-xs font-mono text-zinc-400">
                Querying token contracts...
              </div>
            ) : erc20Balances.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono text-zinc-500">
                {t("explorer.noErc20Found", "No ERC-20 tokens discovered in this window.")}
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60 font-mono text-xs">
                {erc20Balances.map((tok) => (
                  <div
                    key={tok.contractAddress}
                    className="p-4 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-white font-bold">{tok.name}</span>
                        <span className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded-[2px]">
                          {tok.symbol}
                        </span>
                      </div>
                      <div className="flex items-center space-x-1.5 text-[11px] text-zinc-500 mt-1">
                        <button
                          onClick={() =>
                            onNavigate({ view: "address", address: tok.contractAddress })
                          }
                          className="text-sky-400 hover:underline truncate"
                        >
                          {tok.contractAddress}
                        </button>
                        <CopyButton text={tok.contractAddress} />
                      </div>
                    </div>

                    <div className="flex items-center space-x-3">
                      <span className="text-white font-bold text-sm">
                        {tok.formattedBalance} {tok.symbol}
                      </span>
                      {tok.isCustom && (
                        <button
                          onClick={() => handleRemoveCustomToken(tok.contractAddress)}
                          title="Remove custom token"
                          className="p-1 text-zinc-500 hover:text-red-400 transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Token Transfer Events */}
          {tokenTransfers.filter((tr) => tr.standard === "ERC20").length > 0 && (
            <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
              <div className="p-4 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider">
                {t("explorer.recentTokenTransfers", "Recent ERC-20 Transfers")}
              </div>
              <div className="divide-y divide-zinc-800/60 font-mono text-xs">
                {tokenTransfers
                  .filter((tr) => tr.standard === "ERC20")
                  .slice(0, 25)
                  .map((tr) => (
                    <div
                      key={`${tr.transactionHash}-${tr.logIndex}`}
                      onClick={() => onNavigate({ view: "tx", hash: tr.transactionHash })}
                      className="p-3.5 hover:bg-zinc-900/60 cursor-pointer flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="text-[11px] text-zinc-400">
                        <span className="text-sky-400">#{tr.blockNumber}</span> •{" "}
                        {tr.from.slice(0, 8)}... → {tr.to.slice(0, 8)}...
                      </div>
                      <div className="text-white font-bold">
                        {formatTokenAmount(BigInt(tr.value), tr.decimals ?? 18, 4)}{" "}
                        {tr.symbol || "TOKEN"}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: NFTs */}
      {activeTab === "nfts" && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] p-4">
          {loadingTokens ? (
            <div className="p-6 text-center text-xs font-mono text-zinc-400">
              Querying NFT contracts...
            </div>
          ) : nfts.length === 0 ? (
            <div className="p-6 text-center text-xs font-mono text-zinc-500">
              {t("explorer.noNftsFound", "No ERC-721 or ERC-1155 NFTs discovered in this window.")}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {nfts.map((nft) => (
                <div
                  key={`${nft.contractAddress}-${nft.tokenId}`}
                  className="bg-zinc-950 border border-zinc-800 rounded-[2px] overflow-hidden flex flex-col"
                >
                  <div className="aspect-square bg-zinc-900 flex items-center justify-center border-b border-zinc-800 p-3">
                    {nft.imageUri ? (
                      <img
                        src={nft.imageUri}
                        alt={nft.metadataName || `#${nft.tokenId}`}
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <div className="text-center font-mono text-[11px] text-zinc-500 space-y-1">
                        <ImageIcon className="w-8 h-8 mx-auto text-zinc-600" />
                        <div>On-chain preview unavailable</div>
                      </div>
                    )}
                  </div>
                  <div className="p-3 font-mono text-xs space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-white font-bold truncate">
                        {nft.metadataName || `${nft.name || "NFT"} #${nft.tokenId}`}
                      </span>
                      <span className="px-1.5 py-0.5 text-[10px] bg-zinc-800 text-zinc-300 rounded-[2px] shrink-0">
                        {nft.standard}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      ID: #{nft.tokenId} {nft.standard === "ERC1155" ? `• Qty: ${nft.balance}` : ""}
                    </div>
                    <button
                      onClick={() => onNavigate({ view: "address", address: nft.contractAddress })}
                      className="text-[11px] text-sky-400 hover:underline truncate block max-w-full text-left"
                    >
                      {nft.contractAddress}
                    </button>
                    {nft.tokenUri && !nft.imageUri && (
                      <div className="text-[10px] text-zinc-500 break-all pt-1 border-t border-zinc-800/60">
                        URI: {nft.tokenUri}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
