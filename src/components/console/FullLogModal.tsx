import React, { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { X, FolderOpen, ChevronUp, Search, Loader2, FileText } from "lucide-react";
import { api } from "../../services/api";

interface FullLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFolder: () => void;
}

const PAGE_SIZE = 500;

export const FullLogModal: React.FC<FullLogModalProps> = ({ isOpen, onClose, onOpenFolder }) => {
  const { t } = useTranslation();
  const [lines, setLines] = useState<string[]>([]);
  const [totalLines, setTotalLines] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [logsDir, setLogsDir] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const loadPage = async (offset: number, prepend: boolean) => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.readNodeLogs(offset, PAGE_SIZE);
      setTotalLines(res.total_lines);
      setHasMore(res.has_more);
      setLogsDir(res.logs_dir);
      setLines((prev) => (prepend ? [...res.lines, ...prev] : res.lines));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setLines([]);
      setSearch("");
      void loadPage(0, false);
    }
  }, [isOpen]);

  const filteredLines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return lines;
    return lines.filter((l) => l.toLowerCase().includes(q));
  }, [lines, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
      <div className="w-full max-w-5xl h-[85vh] bg-zinc-950 border border-zinc-800 rounded-[2px] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-4 py-3 bg-zinc-900/80 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="flex items-center space-x-2 min-w-0">
            <FileText className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                {t("console.fullLogTitle")}
              </h3>
              {logsDir && (
                <p className="text-[11px] font-mono text-zinc-500 truncate" title={logsDir}>
                  {logsDir} · {t("console.fullLogCount", { loaded: lines.length, total: totalLines })}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <button
              onClick={onOpenFolder}
              className="flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-[2px] text-xs transition"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>{t("console.openLogsFolder")}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-[2px] transition"
              aria-label={t("common.cancel")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search & Load Previous */}
        <div className="px-4 py-2 bg-zinc-900/40 border-b border-zinc-800 flex items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("console.searchPlaceholder")}
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-[2px] pl-8 pr-3 py-1 text-xs font-mono text-white outline-none"
            />
          </div>

          {hasMore && (
            <button
              onClick={() => void loadPage(lines.length, true)}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 rounded-[2px] text-xs font-medium transition disabled:opacity-50"
            >
              {loading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
              <span>{t("console.loadOlderLines", { count: PAGE_SIZE })}</span>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-0.5 select-text">
          {error && (
            <div className="p-3 bg-red-950/40 border border-red-800/50 text-red-300 rounded-[2px] mb-2">
              {error}
            </div>
          )}

          {loading && lines.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-zinc-500 space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{t("common.loading")}</span>
            </div>
          ) : filteredLines.length > 0 ? (
            filteredLines.map((line, idx) => (
              <div
                key={idx}
                className="leading-relaxed text-zinc-300 hover:bg-zinc-900/50 px-1.5 py-0.5 rounded whitespace-pre-wrap break-all"
              >
                {line}
              </div>
            ))
          ) : (
            <div className="text-zinc-600 text-center py-16">{t("console.noMatchingLogs")}</div>
          )}
        </div>
      </div>
    </div>
  );
};

