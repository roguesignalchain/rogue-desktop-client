import React, { useState } from "react";
import { Terminal as TerminalIcon, Send, Trash2, Copy, Check } from "lucide-react";
import { api } from "../services/api";

interface NodeConsoleViewProps {
  logs: string[];
  onClearLogs: () => void;
  rpcUrl: string;
}

export const NodeConsoleView: React.FC<NodeConsoleViewProps> = ({ logs, onClearLogs, rpcUrl }) => {
  const [method, setMethod] = useState("web3_clientVersion");
  const [paramsRaw, setParamsRaw] = useState("[]");
  const [rpcResponse, setRpcResponse] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleExecuteRpc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      let parsedParams = [];
      if (paramsRaw.trim()) {
        parsedParams = JSON.parse(paramsRaw);
      }
      const res = await api.callRpc(rpcUrl, method, parsedParams);
      setRpcResponse(JSON.stringify(res, null, 2));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setRpcResponse(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLogs = () => {
    navigator.clipboard.writeText(logs.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Interactive JSON-RPC Runner */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-4">
        <div className="flex items-center space-x-2 pb-2 border-b border-zinc-800">
          <TerminalIcon className="w-4 h-4 text-purple-400" />
          <h2 className="text-xs font-bold text-white uppercase tracking-wider">JSON-RPC Command Interface</h2>
        </div>

        <form onSubmit={handleExecuteRpc} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
              Method
            </label>
            <input
              type="text"
              value={method}
              onChange={(e) => setMethod(e.target.value.trim())}
              placeholder="eth_blockNumber"
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-1 font-mono">
              Params (JSON array)
            </label>
            <input
              type="text"
              value={paramsRaw}
              onChange={(e) => setParamsRaw(e.target.value)}
              placeholder='["latest", false]'
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-purple-500 rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-[2px] text-xs font-semibold transition"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? "Calling..." : "Execute RPC"}</span>
            </button>
          </div>
        </form>

        {rpcResponse && (
          <div className="mt-2 bg-zinc-950 p-3 rounded-[2px] border border-zinc-800 font-mono text-xs text-purple-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {rpcResponse}
          </div>
        )}
      </div>

      {/* Real-time Streaming Logs */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-[2px] overflow-hidden font-mono text-xs">
        <div className="p-3 bg-zinc-900/60 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-zinc-400 font-bold uppercase text-[11px] tracking-wider">
            Standard Output & Error Stream ({logs.length} lines)
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleCopyLogs}
              className="flex items-center space-x-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] transition"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-white" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
            <button
              onClick={onClearLogs}
              className="flex items-center space-x-1 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-[11px] transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          </div>
        </div>

        <div className="p-4 h-96 overflow-y-auto space-y-1 text-zinc-400 select-text">
          {logs.length > 0 ? (
            logs.map((log, index) => (
              <div key={index} className="leading-relaxed hover:bg-zinc-900/40 px-1 rounded">
                {log}
              </div>
            ))
          ) : (
            <div className="text-zinc-600 text-center py-16">
              Awaiting node engine startup logs...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

