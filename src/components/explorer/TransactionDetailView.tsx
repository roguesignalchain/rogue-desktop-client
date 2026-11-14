import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  FileCode,
  ListTree,
  ArrowRightLeft,
} from "lucide-react";
import { api } from "../../services/api";
import type { ExplorerRoute, RpcTransaction, TransactionReceipt } from "../../types";
import {
  decodeEventLogEntry,
  decodeTransactionInput,
  formatWeiValue,
} from "../../utils/explorerDecode";
import { CopyButton } from "./CopyButton";

interface TransactionDetailViewProps {
  rpcUrl: string;
  hash: string;
  onNavigate: (route: ExplorerRoute) => void;
  onBack: () => void;
}

export const TransactionDetailView: React.FC<TransactionDetailViewProps> = ({
  rpcUrl,
  hash,
  onNavigate,
  onBack,
}) => {
  const { t } = useTranslation();
  const [tx, setTx] = useState<RpcTransaction | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRawInput, setShowRawInput] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [txRes, receiptRes] = await Promise.all([
          api.getTransactionByHash(rpcUrl, hash),
          api.getTransactionReceipt(rpcUrl, hash),
        ]);
        if (!cancelled) {
          if (!txRes) {
            setError(t("explorer.txNotFound", "Transaction not found on node."));
            setTx(null);
            setReceipt(null);
          } else {
            setTx(txRes);
            setReceipt(receiptRes);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [rpcUrl, hash, t]);

  if (loading) {
    return (
      <div className="p-8 bg-zinc-900/40 border border-zinc-800 rounded-[2px] text-center text-xs font-mono text-zinc-400">
        {t("explorer.loadingTx", "Loading transaction and receipt...")}
      </div>
    );
  }

  if (error || !tx) {
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
          {error || t("explorer.txNotFound", "Transaction not found on node.")}
        </div>
      </div>
    );
  }

  const isPending = !receipt || !tx.blockNumber;
  const isSuccess = receipt?.status === "0x1";
  const blockHeight = tx.blockNumber ? parseInt(tx.blockNumber, 16) : null;
  const gasLimit = parseInt(tx.gas || "0x0", 16);
  const gasUsed = receipt ? parseInt(receipt.gasUsed || "0x0", 16) : null;
  const gasPct = gasUsed !== null && gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(2) : null;

  const effectiveGasPriceHex = receipt?.effectiveGasPrice || tx.gasPrice || "0x0";
  const effectiveGasPriceWei = BigInt(effectiveGasPriceHex);
  const gasPriceGwei = Number(effectiveGasPriceWei) / 1e9;
  const txFeeWei = gasUsed !== null ? BigInt(gasUsed) * effectiveGasPriceWei : null;

  const decodedInput = decodeTransactionInput(tx.input, tx.to);
  const logs = receipt?.logs || [];

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
            <ArrowRightLeft className="w-4 h-4 text-white shrink-0" />
            <h2 className="text-sm font-bold font-mono text-white truncate">
              {t("explorer.txDetails", "Transaction Details")}
            </h2>
          </div>
        </div>

        <div>
          {isPending ? (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono bg-amber-950/40 border border-amber-800/60 text-amber-300 rounded-[2px]">
              <Clock className="w-3.5 h-3.5" />
              <span>Pending</span>
            </span>
          ) : isSuccess ? (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 rounded-[2px]">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Success</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 text-xs font-mono bg-red-950/40 border border-red-800/60 text-red-400 rounded-[2px]">
              <XCircle className="w-3.5 h-3.5" />
              <span>Failed</span>
            </span>
          )}
        </div>
      </div>

      {/* Transaction Fields */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] divide-y divide-zinc-800/60 font-mono text-xs">
        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.txHash", "Transaction Hash")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            <span className="text-zinc-200 truncate">{tx.hash}</span>
            <CopyButton text={tx.hash} />
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.blockTitle", "Block")}</span>
          <div className="md:col-span-3">
            {blockHeight !== null ? (
              <button
                onClick={() => onNavigate({ view: "block", blockId: String(blockHeight) })}
                className="text-sky-400 hover:text-sky-300 underline"
              >
                #{blockHeight.toLocaleString()}
              </button>
            ) : (
              <span className="text-amber-400">Pending</span>
            )}
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.from", "From")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            <button
              onClick={() => onNavigate({ view: "address", address: tx.from })}
              className="text-emerald-400 hover:text-emerald-300 underline truncate text-left"
            >
              {tx.from}
            </button>
            <CopyButton text={tx.from} />
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.to", "To")}</span>
          <div className="md:col-span-3 flex items-center space-x-2 min-w-0">
            {tx.to ? (
              <>
                <button
                  onClick={() => onNavigate({ view: "address", address: tx.to! })}
                  className="text-emerald-400 hover:text-emerald-300 underline truncate text-left"
                >
                  {tx.to}
                </button>
                <CopyButton text={tx.to} />
              </>
            ) : receipt?.contractAddress ? (
              <div className="flex items-center space-x-2 min-w-0">
                <span className="text-amber-400 shrink-0">[Contract Created]</span>
                <button
                  onClick={() =>
                    onNavigate({ view: "address", address: receipt.contractAddress! })
                  }
                  className="text-sky-400 hover:text-sky-300 underline truncate"
                >
                  {receipt.contractAddress}
                </button>
                <CopyButton text={receipt.contractAddress} />
              </div>
            ) : (
              <span className="text-amber-400">Contract Creation</span>
            )}
          </div>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.value", "Value")}</span>
          <span className="md:col-span-3 text-white font-bold">
            {formatWeiValue(tx.value, 8)} ROGUE
          </span>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.txFee", "Transaction Fee")}</span>
          <span className="md:col-span-3 text-zinc-200">
            {txFeeWei !== null ? `${formatWeiValue(txFeeWei, 8)} ROGUE` : "—"}
            <span className="text-zinc-500 ml-2">
              ({gasPriceGwei.toFixed(4)} Gwei)
            </span>
          </span>
        </div>

        <div className="p-3.5 grid grid-cols-1 md:grid-cols-4 gap-2 items-center">
          <span className="text-zinc-500">{t("explorer.gasUsed", "Gas Used:")}</span>
          <span className="md:col-span-3 text-zinc-300">
            {gasUsed !== null ? `${gasUsed.toLocaleString()} / ${gasLimit.toLocaleString()} (${gasPct}%)` : `Limit: ${gasLimit.toLocaleString()}`}
            <span className="text-zinc-500 ml-3">
              Nonce: {parseInt(tx.nonce || "0x0", 16)}
            </span>
          </span>
        </div>
      </div>

      {/* Input Data */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode className="w-4 h-4 text-white" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              {t("explorer.inputData", "Input Data")}
            </h3>
            {decodedInput && (
              <span className="px-2 py-0.5 text-[10px] font-mono bg-zinc-800 text-emerald-400 rounded-[2px]">
                {decodedInput.standard} • {decodedInput.functionName}()
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2">
            {decodedInput && (
              <button
                onClick={() => setShowRawInput((v) => !v)}
                className="px-2 py-1 bg-zinc-950 border border-zinc-800 hover:border-zinc-600 text-[11px] font-mono text-zinc-300 rounded-[2px] transition"
              >
                {showRawInput ? "Decoded" : "Raw Hex"}
              </button>
            )}
            <CopyButton text={tx.input || "0x"} />
          </div>
        </div>

        <div className="p-4 font-mono text-xs">
          {decodedInput && !showRawInput ? (
            <div className="space-y-2">
              <div className="text-zinc-300">
                <span className="text-zinc-500">Function: </span>
                <span className="text-white font-bold">{decodedInput.functionName}</span>
              </div>
              {decodedInput.args.length > 0 && (
                <div className="space-y-1 pl-3 border-l border-zinc-800">
                  {decodedInput.args.map((arg, i) => {
                    const isAddr = /^0x[0-9a-fA-F]{40}$/.test(arg);
                    return (
                      <div key={i} className="text-[11px] text-zinc-400 break-all">
                        <span className="text-zinc-500">arg[{i}]: </span>
                        {isAddr ? (
                          <button
                            onClick={() => onNavigate({ view: "address", address: arg })}
                            className="text-sky-400 hover:underline"
                          >
                            {arg}
                          </button>
                        ) : (
                          <span className="text-zinc-200">{arg}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-[2px] text-[11px] text-zinc-400 break-all max-h-40 overflow-y-auto">
              {tx.input || "0x"}
            </div>
          )}
        </div>
      </div>

      {/* Event Logs */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center space-x-2">
          <ListTree className="w-4 h-4 text-white" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            {t("explorer.eventLogs", "Event Logs")} ({logs.length})
          </h3>
        </div>

        {logs.length === 0 ? (
          <div className="p-6 text-center text-xs font-mono text-zinc-500">
            {t("explorer.noLogs", "No event logs emitted by this transaction.")}
          </div>
        ) : (
          <div className="divide-y divide-zinc-800/60 font-mono text-xs">
            {logs.map((log, idx) => {
              const decoded = decodeEventLogEntry(log);
              const logIdx = log.logIndex ? parseInt(log.logIndex, 16) : idx;
              return (
                <div key={`${log.transactionHash}-${logIdx}`} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2 min-w-0">
                      <span className="px-1.5 py-0.5 bg-zinc-950 border border-zinc-800 text-zinc-400 rounded-[2px] text-[10px]">
                        #{logIdx}
                      </span>
                      <button
                        onClick={() => onNavigate({ view: "address", address: log.address })}
                        className="text-emerald-400 hover:underline truncate"
                      >
                        {log.address}
                      </button>
                      <CopyButton text={log.address} />
                    </div>
                    {decoded && (
                      <span className="px-2 py-0.5 bg-zinc-800 text-sky-300 rounded-[2px] text-[10px]">
                        {decoded.standard} • {decoded.eventName}
                      </span>
                    )}
                  </div>

                  {decoded ? (
                    <div className="pl-3 border-l border-zinc-800 space-y-1 text-[11px]">
                      {Object.entries(decoded.args).map(([k, v]) => {
                        const isAddr = /^0x[0-9a-fA-F]{40}$/.test(v);
                        return (
                          <div key={k} className="break-all">
                            <span className="text-zinc-500">{k}: </span>
                            {isAddr ? (
                              <button
                                onClick={() => onNavigate({ view: "address", address: v })}
                                className="text-sky-400 hover:underline"
                              >
                                {v}
                              </button>
                            ) : (
                              <span className="text-zinc-200">{v}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-1 text-[11px] text-zinc-400 break-all">
                      <div>Topics: {log.topics.join(", ")}</div>
                      <div>Data: {log.data}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

