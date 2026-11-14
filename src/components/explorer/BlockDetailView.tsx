import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ChevronLeft, ChevronRight, Layers, Cpu, Award, FileCode } from "lucide-react";
import { api } from "../../services/api";
import type { BlockWithTransactions, ExplorerRoute, RpcTransaction } from "../../types";
import {
  decodeExtraDataUtf8,
  decodeTransactionInput,
  formatWeiValue,
  getBlockRewardBreakdown,
} from "../../utils/explorerDecode";
import { CopyButton } from "./CopyButton";

interface BlockDetailViewProps {
  rpcUrl: string;
  blockId: string;
  onNavigate: (route: ExplorerRoute) => void;
  onBack: () => void;
}

export const BlockDetailView: React.FC<BlockDetailViewProps> = ({
  rpcUrl,
  blockId,
  onNavigate,
  onBack,
}) => {
  const { t } = useTranslation();
  const [block, setBlock] = useState<BlockWithTransactions | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = blockId.startsWith("0x") && blockId.length === 66
          ? await api.getBlockByHash(rpcUrl, blockId, true)
          : await api.getBlockByNumber(rpcUrl, blockId, true);
        if (!cancelled) {
          if (!res) {
            setError(t("explorer.blockNotFound", "Block not found on node."));
            setBlock(null);
          } else {
            setBlock(res as BlockWithTransactions);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setBlock(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [rpcUrl, blockId, t]);

  if (loading) {
    return (
      <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-[2px] text-center text-xs font-mono text-zinc-400">
        {t("explorer.loadingBlock", "Loading block header and transactions...")}
      </div>
    );
  }

  if (error || !block) {
    return (
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-4">
        <button
          onClick={onBack}
          className="inline-flex items-center space-x-1.5 text-xs font-mono text-zinc-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("explorer.back", "Back")}</span>
        </button>
        <div className="p-4 bg-red-950/30 border border-red-900/60 rounded-[2px] text-xs font-mono text-red-300">
          {error || t("explorer.blockNotFound", "Block not found on node.")}
        </div>
      </div>
    );
  }

  const height = parseInt(block.number, 16);
  const timestamp = parseInt(block.timestamp, 16);
  const gasUsed = parseInt(block.gasUsed, 16);
  const gasLimit = parseInt(block.gasLimit, 16);
  const gasPct = gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(2) : "0.00";
  const sizeBytes = block.size ? parseInt(block.size, 16) : null;
  const extraUtf8 = decodeExtraDataUtf8(block.extraData);
  const reward = getBlockRewardBreakdown(height);
  const txs = Array.isArray(block.transactions) ? block.transactions : [];

  return (
    <div className="space-y-5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
        <div className="flex items-center space-x-3">
          <button
            onClick={onBack}
            className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-[2px] text-xs font-mono transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{t("explorer.back", "Back")}</span>
          </button>
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-white" />
            <h2 className="text-sm font-bold font-mono text-white">
              {t("explorer.blockTitle", "Block")} #{height.toLocaleString()}
            </h2>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            disabled={height <= 0}
            onClick={() => onNavigate({ view: "block", blockId: String(height - 1) })}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 disabled:opacity-40 text-xs font-mono text-zinc-300 rounded-[2px] transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>#{Math.max(0, height - 1)}</span>
          </button>
          <button
            onClick={() => onNavigate({ view: "block", blockId: String(height + 1) })}
            className="inline-flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-xs font-mono text-zinc-300 rounded-[2px] transition"
          >
            <span>#{height + 1}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Block Reward Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
            <Award className="w-3.5 h-3.5 text-emerald-400" />
            <span>{t("explorer.blockReward", "Block Reward")} (Era {reward.era})</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-1">
            {reward.totalRewardRogue} ROGUE
          </div>
          <div className="text-[11px] font-mono text-zinc-400 mt-0.5">
            95% Miner ({reward.minerRewardRogue}) / 5% Treasury ({reward.treasuryRewardRogue})
          </div>
        </div>

        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500 flex items-center space-x-1.5">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            <span>{t("explorer.difficulty", "Difficulty:")}</span>
          </div>
          <div className="text-sm font-bold font-mono text-white mt-1">
            {BigInt(block.difficulty || "0x0").toLocaleString()}
          </div>
          {block.totalDifficulty && (
            <div className="text-[11px] font-mono text-zinc-400 mt-0.5 truncate">
              TD: {BigInt(block.totalDifficulty).toLocaleString()}
            </div>
          )}
        </div>

        <div className="p-4 bg-zinc-900/40 border border-zinc-800 rounded-[2px]">
          <div className="text-[11px] font-mono text-zinc-500">
            {t("explorer.gasUsed", "Gas Used:")}
          </div>
          <div className="text-sm font-bold font-mono text-white mt-1">
            {gasUsed.toLocaleString()} / {gasLimit.toLocaleString()} ({gasPct}%)
          </div>
          <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden mt-2 border border-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${Math.min(100, parseFloat(gasPct))}%` }}
            />
          </div>
        </div>
      </div>

      {/* Header Details */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] divide-y divide-zinc-800/60 font-mono text-xs">
        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.timestamp", "Timestamp")}</span>
          <span className="md:col-span-3 text-zinc-200">
            {new Date(timestamp * 1000).toLocaleString()} ({timestamp})
          </span>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.hash", "Hash:")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            <span className="text-zinc-200 truncate">{block.hash}</span>
            <CopyButton text={block.hash} />
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.parentHash", "Parent Hash")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            <button
              onClick={() => onNavigate({ view: "block", blockId: block.parentHash })}
              className="text-sky-400 hover:text-sky-300 underline truncate text-left"
            >
              {block.parentHash}
            </button>
            <CopyButton text={block.parentHash} />
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.miner", "Miner:")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            <button
              onClick={() => onNavigate({ view: "address", address: block.miner })}
              className="text-emerald-400 hover:text-emerald-300 underline truncate text-left"
            >
              {block.miner}
            </button>
            <CopyButton text={block.miner} />
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.extraData", "Extra Data")}</span>
          <div className="md:col-span-3 flex flex-wrap items-center gap-2 min-w-0">
            {extraUtf8 && (
              <span className="px-2 py-0.5 bg-zinc-800 text-white rounded-[2px]">
                {extraUtf8}
              </span>
            )}
            <span className="text-zinc-400 break-all">{block.extraData || "0x"}</span>
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.nonceAndSize", "Nonce / Size")}</span>
          <span className="md:col-span-3 text-zinc-300">
            Nonce: {block.nonce || "0x0"}
            {sizeBytes !== null ? ` • Size: ${sizeBytes.toLocaleString()} bytes` : ""}
            {block.baseFeePerGas ? ` • BaseFee: ${formatWeiValue(block.baseFeePerGas, 9)} ROGUE` : ""}
          </span>
        </div>

        {block.stateRoot && (
          <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
            <span className="text-zinc-500">State Root</span>
            <span className="md:col-span-3 text-zinc-400 truncate">{block.stateRoot}</span>
          </div>
        )}
      </div>

      {/* Transactions List */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-white" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {t("explorer.transactions", "Transactions:")} {txs.length}
            </h3>
          </div>
        </div>

        {txs.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-zinc-500">
            {t("explorer.noTransactionsInBlock", "No transactions included in this block.")}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 font-mono text-xs">
            {txs.map((tx: RpcTransaction) => {
              const decoded = decodeTransactionInput(tx.input, tx.to);
              return (
                <div
                  key={tx.hash}
                  onClick={() => onNavigate({ view: "tx", hash: tx.hash })}
                  className="p-4 hover:bg-zinc-900/70 cursor-pointer transition space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="text-sky-400 hover:underline truncate max-w-[260px] md:max-w-[420px]">
                        {tx.hash}
                      </span>
                      <CopyButton text={tx.hash} />
                      {decoded && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-[2px]">
                          {decoded.standard}:{decoded.functionName}
                        </span>
                      )}
                    </div>
                    <span className="text-white font-bold">
                      {formatWeiValue(tx.value, 6)} ROGUE
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-400">
                    <div className="flex items-center space-x-1">
                      <span className="text-zinc-500">From:</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onNavigate({ view: "address", address: tx.from });
                        }}
                        className="text-zinc-300 hover:text-white underline"
                      >
                        {tx.from.slice(0, 10)}...{tx.from.slice(-6)}
                      </button>
                    </div>
                    <div className="flex items-center space-x-1">
                      <span className="text-zinc-500">To:</span>
                      {tx.to ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigate({ view: "address", address: tx.to! });
                          }}
                          className="text-zinc-300 hover:text-white underline"
                        >
                          {tx.to.slice(0, 10)}...{tx.to.slice(-6)}
                        </button>
                      ) : (
                        <span className="text-amber-400">Contract Creation</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
