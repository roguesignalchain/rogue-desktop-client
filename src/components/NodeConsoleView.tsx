import React, { useState, useEffect, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Terminal as TerminalIcon,
  Send,
  Trash2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  RotateCw,
  BookOpen,
  Search,
  Download,
  FolderOpen,
  FileText,
  ArrowDown,
  WrapText,
  Hash,
  Sparkles,
  History,
  AlertTriangle,
  X,
} from "lucide-react";
import { api } from "../services/api";
import { useLogs } from "../context/LogsContext";
import { NodeStatus, SyncStatus } from "../types";
import { RPC_PRESETS, RpcPreset, getRpcDocsUrl, buildCurlCommand } from "./console/rpcPresets";
import { FullLogModal } from "./console/FullLogModal";

interface NodeConsoleViewProps {
  logs?: string[];
  onClearLogs?: () => void;
  rpcUrl: string;
  nodeStatus?: NodeStatus;
  peerCount?: number;
  syncStatus?: SyncStatus;
  onStartNode?: () => Promise<void>;
  onStopNode?: () => Promise<void>;
  onRestartNode?: () => Promise<void>;
}

interface RpcHistoryItem {
  method: string;
  params: string;
  timestamp: number;
}

type LogFilter = "all" | "errors" | "mining" | "network" | "app";

const STORAGE_RPC_OPEN = "rogue_console_rpc_open";
const STORAGE_RPC_HISTORY = "rogue_console_rpc_history";
const MAX_HISTORY = 25;

function classifyLogLine(line: string): {
  level: "error" | "warn" | "info" | "debug" | "milestone";
  isApp: boolean;
  isMining: boolean;
  isNetwork: boolean;
} {
  const upper = line.toUpperCase();
  const isApp =
    line.startsWith("[App]") ||
    line.startsWith("[Manager") ||
    line.startsWith("[P2P]") ||
    line.startsWith("[Maintenance]");
  const isError =
    upper.includes("ERROR") ||
    upper.includes("CRIT") ||
    upper.includes("FATAL") ||
    line.startsWith("[Manager Error]");
  const isWarn = upper.includes("WARN");
  const isDebug = upper.includes("DEBUG") || upper.includes("TRACE");
  const isMilestone =
    line.includes("Successfully sealed new block") ||
    line.includes("mined potential block") ||
    line.includes("Commit new sealing work") ||
    line.includes("Full Sync");

  const isMining =
    isMilestone ||
    upper.includes("MINER") ||
    upper.includes("RANDOMX") ||
    upper.includes("SEAL") ||
    upper.includes("HASHRATE");
  const isNetwork =
    upper.includes("PEER") ||
    upper.includes("P2P") ||
    upper.includes("SYNC") ||
    upper.includes("IMPORTED NEW CHAIN SEGMENT") ||
    upper.includes("DISCOVER");

  const level = isError
    ? "error"
    : isWarn
    ? "warn"
    : isMilestone
    ? "milestone"
    : isDebug
    ? "debug"
    : "info";

  return { level, isApp, isMining, isNetwork };
}

function getLineClassName(level: "error" | "warn" | "info" | "debug" | "milestone"): string {
  switch (level) {
    case "error":
      return "text-red-400 bg-red-950/20";
    case "warn":
      return "text-amber-300 bg-amber-950/15";
    case "milestone":
      return "text-emerald-300 bg-emerald-950/20 font-semibold";
    case "debug":
      return "text-sky-400/80";
    default:
      return "text-zinc-300";
  }
}

export const NodeConsoleView: React.FC<NodeConsoleViewProps> = ({
  logs: propLogs,
  onClearLogs: propOnClearLogs,
  rpcUrl,
  nodeStatus,
  peerCount = 0,
  syncStatus,
  onStartNode,
  onStopNode,
  onRestartNode,
}) => {
  const { t, i18n } = useTranslation();
  const { logs: ctxLogs, clearLogs: ctxClearLogs } = useLogs();
  const logs = propLogs ?? ctxLogs;
  const onClearLogs = propOnClearLogs ?? ctxClearLogs;

  // Collapsible RPC panel state (expanded by default, persisted)
  const [rpcOpen, setRpcOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_RPC_OPEN);
    return saved === null ? true : saved === "true";
  });

  // Node control state
  const [nodeActionBusy, setNodeActionBusy] = useState(false);
  const [copiedRpcUrl, setCopiedRpcUrl] = useState(false);

  // RPC runner state
  const [selectedPresetId, setSelectedPresetId] = useState<string>("web3_clientVersion");
  const [method, setMethod] = useState("web3_clientVersion");
  const [paramsRaw, setParamsRaw] = useState("[]");
  const [rpcResponse, setRpcResponse] = useState<string | null>(null);
  const [rpcMeta, setRpcMeta] = useState<{ ok: boolean; latencyMs: number } | null>(null);
  const [loadingRpc, setLoadingRpc] = useState(false);
  const [copiedResponse, setCopiedResponse] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  // RPC history
  const [history, setHistory] = useState<RpcHistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_RPC_HISTORY);
      return raw ? (JSON.parse(raw) as RpcHistoryItem[]) : [];
    } catch {
      return [];
    }
  });
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [showHistory, setShowHistory] = useState(false);

  // Log viewer state
  const [searchQuery, setSearchQuery] = useState("");
  const [logFilter, setLogFilter] = useState<LogFilter>("all");
  const [wordWrap, setWordWrap] = useState(true);
  const [showLineNumbers, setShowLineNumbers] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [fullLogOpen, setFullLogOpen] = useState(false);

  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activePreset: RpcPreset | undefined = useMemo(
    () => RPC_PRESETS.find((p) => p.id === selectedPresetId),
    [selectedPresetId]
  );

  // Live JSON validation for params
  const paramsValidation = useMemo(() => {
    const trimmed = paramsRaw.trim();
    if (!trimmed) return { valid: true, parsed: [] as unknown[], error: null as string | null };
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        return { valid: false, parsed: [], error: t("console.paramsMustBeArray") };
      }
      return { valid: true, parsed, error: null };
    } catch (e: unknown) {
      return {
        valid: false,
        parsed: [],
        error: e instanceof Error ? e.message : t("console.invalidJson"),
      };
    }
  }, [paramsRaw, t]);

  // Persist rpcOpen
  useEffect(() => {
    localStorage.setItem(STORAGE_RPC_OPEN, String(rpcOpen));
  }, [rpcOpen]);

  // Persist history
  useEffect(() => {
    localStorage.setItem(STORAGE_RPC_HISTORY, JSON.stringify(history));
  }, [history]);

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll, logFilter, searchQuery]);

  // Keyboard shortcuts (Ctrl+F -> focus log search, Ctrl+L -> clear view)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        onClearLogs();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClearLogs]);

  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const atBottom = distanceFromBottom < 32;
    if (atBottom && !autoScroll) {
      setAutoScroll(true);
    } else if (!atBottom && autoScroll) {
      setAutoScroll(false);
    }
  };

  const scrollToBottom = () => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
    setAutoScroll(true);
  };

  const handleSelectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = RPC_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setMethod(preset.method);
      setParamsRaw(preset.defaultParams);
      setHistoryIndex(-1);
    }
  };

  const handleFormatParams = () => {
    if (!paramsValidation.valid) return;
    setParamsRaw(JSON.stringify(paramsValidation.parsed, null, 2));
  };

  const executeRpc = async (targetMethod = method, targetParamsRaw = paramsRaw) => {
    let parsedParams: unknown[] = [];
    if (targetParamsRaw.trim()) {
      try {
        const parsed = JSON.parse(targetParamsRaw);
        if (!Array.isArray(parsed)) {
          setRpcMeta({ ok: false, latencyMs: 0 });
          setRpcResponse(`Error: ${t("console.paramsMustBeArray")}`);
          return;
        }
        parsedParams = parsed;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setRpcMeta({ ok: false, latencyMs: 0 });
        setRpcResponse(`JSON Parse Error: ${msg}`);
        return;
      }
    }

    const start = performance.now();
    try {
      setLoadingRpc(true);
      const res = await api.callRpc(rpcUrl, targetMethod.trim(), parsedParams);
      const latencyMs = Math.round(performance.now() - start);
      setRpcMeta({ ok: true, latencyMs });
      setRpcResponse(JSON.stringify(res, null, 2));

      // Push to history (deduplicated at top)
      setHistory((prev) => {
        const filtered = prev.filter(
          (item) => !(item.method === targetMethod.trim() && item.params === targetParamsRaw)
        );
        return [
          { method: targetMethod.trim(), params: targetParamsRaw, timestamp: Date.now() },
          ...filtered,
        ].slice(0, MAX_HISTORY);
      });
      setHistoryIndex(-1);
    } catch (err: unknown) {
      const latencyMs = Math.round(performance.now() - start);
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setRpcMeta({ ok: false, latencyMs });
      setRpcResponse(`Error: ${msg}`);
    } finally {
      setLoadingRpc(false);
    }
  };

  const handleMethodKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, history.length - 1);
      setHistoryIndex(next);
      setMethod(history[next].method);
      setParamsRaw(history[next].params);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIndex <= 0) {
        setHistoryIndex(-1);
      } else {
        const next = historyIndex - 1;
        setHistoryIndex(next);
        setMethod(history[next].method);
        setParamsRaw(history[next].params);
      }
    }
  };

  const handleOpenDocs = async () => {
    const url = getRpcDocsUrl(i18n.language, activePreset?.docAnchor);
    try {
      const shell = await import("@tauri-apps/plugin-shell");
      await shell.open(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  const handleCopyCurl = () => {
    const cmd = buildCurlCommand(rpcUrl, method.trim(), paramsValidation.parsed);
    navigator.clipboard.writeText(cmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopyResponse = () => {
    if (!rpcResponse) return;
    navigator.clipboard.writeText(rpcResponse);
    setCopiedResponse(true);
    setTimeout(() => setCopiedResponse(false), 2000);
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(filteredLogs.map((item) => item.line).join("\n"));
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 2000);
  };

  const handleOpenLogsFolder = async () => {
    try {
      await api.openLogsFolder();
    } catch (err: unknown) {
      setExportStatus(err instanceof Error ? err.message : String(err));
      setTimeout(() => setExportStatus(null), 4000);
    }
  };

  const handleExportDiagnostic = async () => {
    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const filename = `rogue-diagnostic-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
        now.getDate()
      )}-${pad(now.getHours())}${pad(now.getMinutes())}.log`;

      const dialog = await import("@tauri-apps/plugin-dialog");
      const targetPath = await dialog.save({
        defaultPath: filename,
        filters: [{ name: "Log Files", extensions: ["log", "txt"] }],
      });
      if (!targetPath) return;

      const headerLines = [
        "================ ROGUE SIGNAL DIAGNOSTIC REPORT ================",
        `Generated At (UTC): ${now.toISOString()}`,
        `Platform / UA: ${navigator.platform} | ${navigator.userAgent}`,
        `Chain ID: 800055 (Rogue Signal)`,
        `RPC URL: ${rpcUrl}`,
        `Node Running: ${nodeStatus?.running ? "yes" : "no"} (PID: ${nodeStatus?.pid ?? "N/A"})`,
        `Peers Connected: ${peerCount}`,
        `Syncing: ${
          syncStatus?.isSyncing
            ? `yes (${syncStatus.currentBlock}/${syncStatus.highestBlock})`
            : "no"
        }`,
      ].join("\n");

      const exportedCount = await api.exportDiagnosticLog(targetPath, headerLines);
      setExportStatus(t("console.exportSuccess", { count: exportedCount }));
      setTimeout(() => setExportStatus(null), 4000);
    } catch (err: unknown) {
      setExportStatus(
        `${t("console.exportError")}: ${err instanceof Error ? err.message : String(err)}`
      );
      setTimeout(() => setExportStatus(null), 5000);
    }
  };

  const runNodeAction = async (action?: () => Promise<void>) => {
    if (!action || nodeActionBusy) return;
    try {
      setNodeActionBusy(true);
      await action();
    } finally {
      setNodeActionBusy(false);
    }
  };

  // Classify and count logs
  const classifiedLogs = useMemo(() => {
    let errors = 0;
    let warns = 0;
    const entries = logs.map((line, index) => {
      const meta = classifyLogLine(line);
      if (meta.level === "error") errors += 1;
      if (meta.level === "warn") warns += 1;
      return { line, index: index + 1, ...meta };
    });
    return { entries, errors, warns };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classifiedLogs.entries.filter((entry) => {
      if (logFilter === "errors" && entry.level !== "error" && entry.level !== "warn") return false;
      if (logFilter === "mining" && !entry.isMining) return false;
      if (logFilter === "network" && !entry.isNetwork) return false;
      if (logFilter === "app" && !entry.isApp) return false;
      if (q && !entry.line.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [classifiedLogs.entries, logFilter, searchQuery]);

  return (
    <div
      className="flex flex-col gap-3 h-[calc(100vh-7.5rem)] min-h-[600px]"
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && rpcOpen) {
          e.preventDefault();
          void executeRpc();
        }
      }}
    >
      {/* Top Node Status & Quick Control Bar */}
      <div className="px-4 py-2.5 bg-zinc-900/60 border border-zinc-800 rounded-[2px] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                nodeStatus?.running ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"
              }`}
            />
            <span className="font-bold text-white uppercase tracking-wider">
              {nodeStatus?.running ? t("console.nodeOnline") : t("console.nodeOffline")}
            </span>
          </div>

          {nodeStatus?.running && nodeStatus.pid && (
            <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400">
              PID: <span className="text-zinc-200">{nodeStatus.pid}</span>
            </span>
          )}

          <span className="px-2 py-0.5 bg-zinc-950 border border-zinc-800 rounded text-zinc-400">
            {t("common.peers")}: <span className="text-zinc-200">{peerCount}</span>
          </span>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(rpcUrl);
              setCopiedRpcUrl(true);
              setTimeout(() => setCopiedRpcUrl(false), 1500);
            }}
            className="flex items-center space-x-1.5 px-2 py-0.5 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-400 hover:text-white transition"
            title={t("common.copy")}
          >
            <span>{rpcUrl}</span>
            {copiedRpcUrl ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          {!nodeStatus?.running ? (
            <button
              type="button"
              onClick={() => void runNodeAction(onStartNode)}
              disabled={nodeActionBusy || !onStartNode}
              className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-[2px] text-xs font-semibold transition"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{t("console.startNode")}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void runNodeAction(onRestartNode)}
                disabled={nodeActionBusy || !onRestartNode}
                className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-zinc-200 rounded-[2px] text-xs font-medium transition"
              >
                <RotateCw className={`w-3.5 h-3.5 ${nodeActionBusy ? "animate-spin" : ""}`} />
                <span>{t("console.restartNode")}</span>
              </button>
              <button
                type="button"
                onClick={() => void runNodeAction(onStopNode)}
                disabled={nodeActionBusy || !onStopNode}
                className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-white rounded-[2px] text-xs font-medium transition"
              >
                <Square className="w-3 h-3" />
                <span>{t("console.stopNode")}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Collapsible Interactive JSON-RPC Runner */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] shrink-0">
        <div
          className="px-4 py-2.5 flex items-center justify-between cursor-pointer select-none hover:bg-zinc-900/60 transition"
          onClick={() => setRpcOpen((o) => !o)}
        >
          <div className="flex items-center space-x-2">
            {rpcOpen ? (
              <ChevronDown className="w-4 h-4 text-zinc-400" />
            ) : (
              <ChevronRight className="w-4 h-4 text-zinc-400" />
            )}
            <TerminalIcon className="w-4 h-4 text-purple-400" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">
              {t("console.title")}
            </h2>
            {!rpcOpen && (
              <span className="text-[11px] font-mono text-zinc-500 ml-2">{method}</span>
            )}
          </div>

          <div
            className="flex items-center space-x-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => void handleOpenDocs()}
              className="flex items-center space-x-1 px-2.5 py-1 bg-zinc-800/80 hover:bg-zinc-700 text-purple-300 rounded-[2px] text-[11px] font-medium transition"
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>{t("console.viewDocs")}</span>
            </button>
          </div>
        </div>

        {rpcOpen && (
          <div className="p-4 pt-2 border-t border-zinc-800 space-y-3">
            {/* Presets & History bar */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
                <label className="text-[11px] font-mono text-zinc-400 uppercase">
                  {t("console.presetLabel")}:
                </label>
                <select
                  value={selectedPresetId}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-[2px] px-2.5 py-1 text-xs font-mono text-white outline-none"
                >
                  {(["chain", "network", "mining", "admin", "reputation"] as const).map((cat) => (
                    <optgroup key={cat} label={t(`console.categories.${cat}`)}>
                      {RPC_PRESETS.filter((p) => p.category === cat).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.id}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>

                {activePreset && (
                  <span
                    className="text-[11px] text-zinc-400 truncate max-w-md"
                    title={t(activePreset.descKey)}
                  >
                    {t(activePreset.descKey)}
                  </span>
                )}

                {activePreset?.requiresApiFlag && (
                  <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-amber-950/60 border border-amber-700/50 text-amber-300 rounded text-[10px] font-mono">
                    <AlertTriangle className="w-3 h-3" />
                    <span>
                      {t("console.requiresApiFlag", { flag: activePreset.requiresApiFlag })}
                    </span>
                  </span>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowHistory((s) => !s)}
                  className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[2px] text-[11px] transition"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>
                    {t("console.history")} ({history.length})
                  </span>
                </button>

                {showHistory && (
                  <div className="absolute right-0 mt-1 w-80 max-h-64 overflow-y-auto bg-zinc-950 border border-zinc-700 rounded-[2px] shadow-xl z-30">
                    <div className="px-3 py-1.5 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-[11px] font-bold text-zinc-300 uppercase">
                        {t("console.recentCalls")}
                      </span>
                      {history.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setHistory([])}
                          className="text-[10px] text-red-400 hover:text-red-300"
                        >
                          {t("console.clearHistory")}
                        </button>
                      )}
                    </div>
                    {history.length === 0 ? (
                      <div className="p-3 text-xs text-zinc-500 text-center">
                        {t("console.emptyHistory")}
                      </div>
                    ) : (
                      history.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setMethod(item.method);
                            setParamsRaw(item.params);
                            setShowHistory(false);
                            void executeRpc(item.method, item.params);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-zinc-900 border-b border-zinc-800/60 last:border-0"
                        >
                          <div className="text-xs font-mono text-purple-300">{item.method}</div>
                          <div className="text-[10px] font-mono text-zinc-500 truncate">
                            {item.params}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Method & Params Form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void executeRpc();
              }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start"
            >
              <div className="lg:col-span-4">
                <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
                  {t("console.method")}
                </label>
                <input
                  type="text"
                  value={method}
                  onChange={(e) => setMethod(e.target.value.trim())}
                  onKeyDown={handleMethodKeyDown}
                  placeholder="eth_blockNumber"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none"
                  required
                />
              </div>

              <div className="lg:col-span-5">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                    {t("console.params")}
                  </label>
                  <button
                    type="button"
                    onClick={handleFormatParams}
                    disabled={!paramsValidation.valid}
                    className="flex items-center space-x-1 text-[10px] font-mono text-purple-400 hover:text-purple-300 disabled:opacity-40"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{t("console.formatJson")}</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={paramsRaw}
                  onChange={(e) => setParamsRaw(e.target.value)}
                  placeholder='["latest", false]'
                  className={`w-full bg-zinc-950 border rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none resize-y min-h-[34px] ${
                    paramsValidation.valid
                      ? "border-zinc-800 focus:border-purple-500"
                      : "border-red-500 focus:border-red-400"
                  }`}
                />
                {!paramsValidation.valid && (
                  <p className="text-[10px] font-mono text-red-400 mt-0.5">
                    {paramsValidation.error}
                  </p>
                )}
              </div>

              <div className="lg:col-span-3 flex items-center gap-2 lg:pt-5">
                <button
                  type="submit"
                  disabled={loadingRpc || !paramsValidation.valid}
                  className="flex-1 flex items-center justify-center space-x-1.5 py-1.5 px-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-[2px] text-xs font-semibold transition"
                  title="Ctrl+Enter"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{loadingRpc ? t("console.calling") : t("console.execute")}</span>
                </button>
                <button
                  type="button"
                  onClick={handleCopyCurl}
                  disabled={!paramsValidation.valid}
                  className="flex items-center space-x-1 py-1.5 px-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-200 rounded-[2px] text-xs transition"
                  title={t("console.copyCurl")}
                >
                  {copiedCurl ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>curl</span>
                </button>
              </div>
            </form>

            {/* RPC Response */}
            {rpcResponse && (
              <div className="bg-zinc-950 border border-zinc-800 rounded-[2px] overflow-hidden">
                <div className="px-3 py-1.5 bg-zinc-900/70 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-mono text-[11px]">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold ${
                        rpcMeta?.ok
                          ? "bg-emerald-950/70 text-emerald-400 border border-emerald-700/40"
                          : "bg-red-950/70 text-red-400 border border-red-700/40"
                      }`}
                    >
                      {rpcMeta?.ok ? "OK" : "ERROR"}
                    </span>
                    {rpcMeta && (
                      <span className="text-zinc-500">{rpcMeta.latencyMs} ms</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={handleCopyResponse}
                      className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-white"
                    >
                      {copiedResponse ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                      <span>{copiedResponse ? t("common.copied") : t("common.copy")}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRpcResponse(null);
                        setRpcMeta(null);
                      }}
                      className="text-zinc-500 hover:text-zinc-200"
                      aria-label={t("common.clear")}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <pre className="p-3 font-mono text-xs text-purple-200 max-h-44 overflow-y-auto whitespace-pre-wrap select-text">
                  {rpcResponse}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Real-time Streaming Logs (fills remaining height) */}
      <div className="flex-1 min-h-[280px] bg-zinc-950 border border-zinc-800 rounded-[2px] flex flex-col overflow-hidden font-mono text-xs relative">
        {/* Logs Toolbar */}
        <div className="p-2.5 bg-zinc-900/70 border-b border-zinc-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-zinc-300 font-bold uppercase text-[11px] tracking-wider">
              {t("console.streamTitle", { count: filteredLogs.length })}
            </span>

            {classifiedLogs.errors > 0 && (
              <span className="px-1.5 py-0.5 bg-red-950/70 border border-red-800/50 text-red-400 rounded text-[10px]">
                ERR: {classifiedLogs.errors}
              </span>
            )}
            {classifiedLogs.warns > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-950/70 border border-amber-800/50 text-amber-300 rounded text-[10px]">
                WARN: {classifiedLogs.warns}
              </span>
            )}

            {/* Quick filter chips */}
            <div className="flex items-center gap-1 ml-1">
              {(["all", "errors", "mining", "network", "app"] as LogFilter[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setLogFilter(f)}
                  className={`px-2 py-0.5 rounded text-[10px] transition ${
                    logFilter === f
                      ? "bg-purple-600 text-white font-semibold"
                      : "bg-zinc-800/80 text-zinc-400 hover:text-white"
                  }`}
                >
                  {t(`console.filters.${f}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Search input */}
            <div className="relative">
              <Search className="w-3 h-3 text-zinc-500 absolute left-2 top-1/2 -translate-y-1/2" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("console.searchPlaceholder")}
                className="w-40 bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded pl-6 pr-2 py-1 text-[11px] text-white outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => setWordWrap((w) => !w)}
              className={`p-1 rounded border transition ${
                wordWrap
                  ? "bg-zinc-800 border-purple-500/50 text-purple-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
              title={t("console.toggleWrap")}
            >
              <WrapText className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setShowLineNumbers((n) => !n)}
              className={`p-1 rounded border transition ${
                showLineNumbers
                  ? "bg-zinc-800 border-purple-500/50 text-purple-300"
                  : "bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300"
              }`}
              title={t("console.toggleLineNumbers")}
            >
              <Hash className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setFullLogOpen(true)}
              className="flex items-center space-x-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-[11px] transition"
              title={t("console.viewFullLog")}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{t("console.viewFullLog")}</span>
            </button>

            <button
              type="button"
              onClick={() => void handleOpenLogsFolder()}
              className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition"
              title={t("console.openLogsFolder")}
            >
              <FolderOpen className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void handleExportDiagnostic()}
              className="flex items-center space-x-1 px-2 py-1 bg-purple-600/20 hover:bg-purple-600/35 border border-purple-500/40 text-purple-200 rounded text-[11px] transition"
              title={t("console.exportDiagnostic")}
            >
              <Download className="w-3.5 h-3.5" />
              <span>{t("console.exportDiagnostic")}</span>
            </button>

            <button
              type="button"
              onClick={handleCopyLogs}
              className="flex items-center space-x-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] transition"
            >
              {copiedLogs ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              <span>{copiedLogs ? t("common.copied") : t("common.copy")}</span>
            </button>

            <button
              type="button"
              onClick={onClearLogs}
              className="flex items-center space-x-1 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] transition"
              title={`${t("common.clear")} (Ctrl+L)`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{t("common.clear")}</span>
            </button>
          </div>
        </div>

        {exportStatus && (
          <div className="px-3 py-1.5 bg-purple-950/60 border-b border-purple-700/40 text-purple-200 text-[11px]">
            {exportStatus}
          </div>
        )}

        {/* Log Lines */}
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="flex-1 p-3 overflow-y-auto space-y-0.5 select-text"
        >
          {filteredLogs.length > 0 ? (
            filteredLogs.map((entry) => (
              <div
                key={entry.index}
                className={`leading-relaxed px-1.5 py-0.5 rounded flex items-start gap-2 ${getLineClassName(
                  entry.level
                )} ${wordWrap ? "whitespace-pre-wrap break-all" : "whitespace-pre"}`}
              >
                {showLineNumbers && (
                  <span className="text-zinc-600 select-none shrink-0 w-10 text-right">
                    {entry.index}
                  </span>
                )}
                <span className="flex-1">{entry.line}</span>
              </div>
            ))
          ) : (
            <div className="text-zinc-600 text-center py-16">
              {logs.length === 0 ? t("console.awaitingLogs") : t("console.noMatchingLogs")}
            </div>
          )}
        </div>

        {/* Floating Resume Auto-Scroll button */}
        {!autoScroll && (
          <button
            type="button"
            onClick={scrollToBottom}
            className="absolute bottom-4 right-5 flex items-center space-x-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-full shadow-lg text-xs font-semibold transition"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>{t("console.resumeAutoScroll")}</span>
          </button>
        )}
      </div>

      <FullLogModal
        isOpen={fullLogOpen}
        onClose={() => setFullLogOpen(false)}
        onOpenFolder={() => void handleOpenLogsFolder()}
      />
    </div>
  );
};
