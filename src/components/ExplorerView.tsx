import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Compass,
  Search,
  RefreshCw,
  Layers,
  Clock,
  Cpu,
  Fuel,
  Activity,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { api } from "../services/api";
import type { Block, ExplorerRoute } from "../types";
import { BlockDetailView } from "./explorer/BlockDetailView";
import { TransactionDetailView } from "./explorer/TransactionDetailView";
import { CopyButton } from "./explorer/CopyButton";

interface ExplorerViewProps {
  blocks: Block[];
  onRefresh: () => void;
  loading: boolean;
  rpcUrl: string;
}

const PAGE_SIZE = 10;

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  blocks,
  onRefresh,
  loading,
  rpcUrl,
}) => {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [history, setHistory] = useState<ExplorerRoute[]>([{ view: "home" }]);
  const currentRoute = history[history.length - 1];

  const [pagedBlocks, setPagedBlocks] = useState<Block[] | null>(null);
  const [pageCursor, setPageCursor] = useState<number | null>(null);
  const [loadingPage, setLoadingPage] = useState(false);

  const navigate = (route: ExplorerRoute) => {
    setSearchError(null);
    setHistory((prev) => {
      const top = prev[prev.length - 1];
      if (JSON.stringify(top) === JSON.stringify(route)) return prev;
      return [...prev, route];
    });
  };

  const goBack = () => {
    setSearchError(null);
    setHistory((prev) => (prev.length > 1 ? prev.slice(0, -1) : [{ view: "home" }]));
  };

  const handleGlobalSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchTerm.trim();
    if (!q) return;
    setSearchError(null);

    if (/^\d+$/.test(q)) {
      navigate({ view: "block", blockId: q });
      return;
    }

    if (/^0x[0-9a-fA-F]{40}$/.test(q)) {
      navigate({ view: "address", address: q });
      return;
    }

    if (/^0x[0-9a-fA-F]{64}$/.test(q)) {
      setSearching(true);
      try {
        const tx = await api.getTransactionByHash(rpcUrl, q);
        if (tx) {
          navigate({ view: "tx", hash: q });
          return;
        }
        const blk = await api.getBlockByHash(rpcUrl, q, false);
        if (blk) {
          navigate({ view: "block", blockId: q });
          return;
        }
        setSearchError(t("explorer.searchNotFound", "No block or transaction found for this hash."));
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : String(err));
      } finally {
        setSearching(false);
      }
      return;
    }

    setSearchError(
      t(
        "explorer.searchInvalidFormat",
        "Enter a block number, 0x... transaction/block hash (64 hex), or 0x... address (40 hex)."
      )
    );
  };

  const loadOlderBlocks = async (startFrom: number) => {
    if (startFrom < 0) return;
    setLoadingPage(true);
    try {
      const fetched = await api.getBlocksRange(rpcUrl, startFrom, PAGE_SIZE);
      setPagedBlocks(fetched);
      setPageCursor(startFrom);
    } finally {
      setLoadingPage(false);
    }
  };

  const resetToLiveHead = () => {
    setPagedBlocks(null);
    setPageCursor(null);
    onRefresh();
  };

  const activeBlocks = pagedBlocks ?? blocks;

  const filteredBlocks = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q || currentRoute.view !== "home") return activeBlocks;
    return activeBlocks.filter(
      (b) =>
        b.hash.toLowerCase().includes(q) ||
        parseInt(b.number, 16).toString().includes(q) ||
        b.miner.toLowerCase().includes(q)
    );
  }, [activeBlocks, searchTerm, currentRoute.view]);

  const kpis = useMemo(() => {
    if (activeBlocks.length === 0) {
      return { latestHeight: 0, avgBlockTime: null as number | null, difficulty: "0", avgGasPct: "0.0" };
    }
    const latestHeight = parseInt(activeBlocks[0].number, 16);
    const difficulty = BigInt(activeBlocks[0].difficulty || "0x0").toLocaleString();

    let totalDelta = 0;
    let deltaCount = 0;
    for (let i = 0; i < activeBlocks.length - 1; i++) {
      const t1 = parseInt(activeBlocks[i].timestamp, 16);
      const t2 = parseInt(activeBlocks[i + 1].timestamp, 16);
      const diff = t1 - t2;
      if (diff >= 0 && diff < 3600) {
        totalDelta += diff;
        deltaCount++;
      }
    }
    const avgBlockTime = deltaCount > 0 ? totalDelta / deltaCount : null;

    let gasPctSum = 0;
    for (const b of activeBlocks) {
      const used = parseInt(b.gasUsed, 16);
      const limit = parseInt(b.gasLimit, 16);
      gasPctSum += limit > 0 ? (used / limit) * 100 : 0;
    }
    const avgGasPct = (gasPctSum / activeBlocks.length).toFixed(1);

    return { latestHeight, avgBlockTime, difficulty, avgGasPct };
  }, [activeBlocks]);

  const oldestDisplayedHeight =
    activeBlocks.length > 0 ? parseInt(activeBlocks[activeBlocks.length - 1].number, 16) : 0;

  return (
    <div className="space-y-6">
      {/* Header and Global Search */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <Compass className="w-5 h-5 text-white" />
              <span>{t("explorer.title")}</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">{t("explorer.subtitle")}</p>
          </div>

          <div className="flex items-center space-x-2">
            {currentRoute.view !== "home" && (
              <button
                onClick={() => setHistory([{ view: "home" }])}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-zinc-300 rounded-[2px] text-xs font-mono transition"
              >
                {t("explorer.allBlocks", "Recent Blocks")}
              </button>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-[2px] text-xs font-mono transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-white" : ""}`} />
              <span>{t("common.refresh")}</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleGlobalSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (searchError) setSearchError(null);
              }}
              placeholder={t("explorer.searchPlaceholder")}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] pl-10 pr-4 py-2 text-xs font-mono text-white outline-none transition"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !searchTerm.trim()}
            className="px-4 py-2 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black font-bold rounded-[2px] text-xs font-mono transition"
          >
            {searching ? "..." : t("explorer.searchBtn", "Search")}
          </button>
        </form>

        {searchError && (
          <div className="p-2.5 bg-red-950/30 border border-red-900/60 rounded-[2px] text-xs font-mono text-red-300">
            {searchError}
          </div>
        )}
      </div>

      {/* Sub-views */}
      {currentRoute.view === "block" && (
        <BlockDetailView
          rpcUrl={rpcUrl}
          blockId={currentRoute.blockId}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}

      {currentRoute.view === "tx" && (
        <TransactionDetailView
          rpcUrl={rpcUrl}
          hash={currentRoute.hash}
          onNavigate={navigate}
          onBack={goBack}
        />
      )}

      {currentRoute.view === "address" && (
        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-3 font-mono text-xs">
          <button
            onClick={goBack}
            className="inline-flex items-center space-x-1.5 text-zinc-400 hover:text-white"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("explorer.back", "Back")}</span>
          </button>
          <div className="text-white font-bold">Address: {currentRoute.address}</div>
          <div className="text-zinc-400">Account, ERC-20 & NFT view coming in next step.</div>
        </div>
      )}

      {/* Home View: KPIs + Block List */}
      {currentRoute.view === "home" && (
        <>
          {/* Compact KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
              <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
                <Activity className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t("explorer.kpiHeight", "Block Height")}</span>
              </div>
              <div className="text-base font-bold font-mono text-white mt-1">
                #{kpis.latestHeight.toLocaleString()}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
              <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>{t("explorer.kpiBlockTime", "Avg Block Time")}</span>
              </div>
              <div className="text-base font-bold font-mono text-white mt-1">
                {kpis.avgBlockTime !== null ? `${kpis.avgBlockTime.toFixed(1)}s` : "—"}{" "}
                <span className="text-[11px] font-normal text-zinc-500">/ 30s</span>
              </div>
            </div>

            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
              <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-amber-400" />
                <span>{t("explorer.kpiDifficulty", "LWMA-1 Difficulty")}</span>
              </div>
              <div className="text-base font-bold font-mono text-white mt-1 truncate">
                {kpis.difficulty}
              </div>
            </div>

            <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
              <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
                <Fuel className="w-3.5 h-3.5 text-purple-400" />
                <span>{t("explorer.kpiGas", "Avg Gas Used")}</span>
              </div>
              <div className="text-base font-bold font-mono text-white mt-1">
                {kpis.avgGasPct}%
              </div>
            </div>
          </div>

          {/* Block List */}
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
            <div className="p-4 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center space-x-2">
                <Layers className="w-4 h-4 text-white" />
                <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                  {t("explorer.recentBlocks", { count: filteredBlocks.length })}
                </h2>
                {pageCursor === null ? (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-emerald-950/60 border border-emerald-800/60 text-emerald-400 rounded-[2px]">
                    LIVE
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-zinc-800 text-zinc-300 rounded-[2px]">
                    ARCHIVE
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-2 font-mono text-xs">
                {pageCursor !== null && (
                  <button
                    onClick={resetToLiveHead}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-white rounded-[2px] transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>{t("explorer.liveHead", "Latest")}</span>
                  </button>
                )}
                <button
                  disabled={loadingPage || oldestDisplayedHeight <= 0}
                  onClick={() => loadOlderBlocks(oldestDisplayedHeight - 1)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 disabled:opacity-40 text-zinc-300 rounded-[2px] transition"
                >
                  <span>{loadingPage ? "..." : t("explorer.olderBlocks", "Older Blocks")}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-zinc-800/60 font-mono text-xs">
              {filteredBlocks.length > 0 ? (
                filteredBlocks.map((b, idx) => {
                  const height = parseInt(b.number, 16);
                  const gasUsed = parseInt(b.gasUsed, 16);
                  const gasLimit = parseInt(b.gasLimit, 16);
                  const gasPct = gasLimit > 0 ? (gasUsed / gasLimit) * 100 : 0;
                  const ts = parseInt(b.timestamp, 16);
                  const date = new Date(ts * 1000).toLocaleTimeString();

                  const nextOlder = filteredBlocks[idx + 1];
                  const deltaSec = nextOlder
                    ? ts - parseInt(nextOlder.timestamp, 16)
                    : null;

                  return (
                    <div
                      key={b.hash}
                      onClick={() => navigate({ view: "block", blockId: String(height) })}
                      className="p-4 hover:bg-zinc-900/60 cursor-pointer transition space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <span className="text-white font-bold text-sm hover:underline">
                            #{height.toLocaleString()}
                          </span>
                          <span className="text-zinc-500 text-[11px]">{date}</span>
                          {deltaSec !== null && deltaSec >= 0 && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded-[2px]">
                              +{deltaSec}s
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                          {t("explorer.difficulty")} {BigInt(b.difficulty || "0x0").toLocaleString()}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-zinc-400 text-[11px]">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="text-zinc-500 shrink-0">{t("explorer.hash")}</span>
                          <span className="text-zinc-300 truncate">{b.hash}</span>
                          <CopyButton text={b.hash} />
                        </div>
                        <div className="flex items-center space-x-1.5 min-w-0">
                          <span className="text-zinc-500 shrink-0">{t("explorer.miner")}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({ view: "address", address: b.miner });
                            }}
                            className="text-emerald-400 hover:text-emerald-300 underline truncate text-left"
                          >
                            {b.miner}
                          </button>
                          <CopyButton text={b.miner} />
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1 gap-4">
                        <div className="flex items-center space-x-3 flex-1 max-w-xs">
                          <span className="shrink-0">
                            {t("explorer.gasUsed")}{" "}
                            <span className="text-zinc-300">
                              {gasUsed.toLocaleString()} ({gasPct.toFixed(1)}%)
                            </span>
                          </span>
                          <div className="flex-1 h-1.5 bg-zinc-950 rounded-full overflow-hidden border border-zinc-800">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.min(100, gasPct)}%` }}
                            />
                          </div>
                        </div>
                        <div>
                          <span>{t("explorer.transactions")} </span>
                          <span className="text-white font-bold">{b.transactions.length}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-zinc-500 text-xs">
                  {t("explorer.noBlocksFound")}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
