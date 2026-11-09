import React, { useState } from "react";
import { Compass, Search, RefreshCw, Layers } from "lucide-react";
import { Block } from "../types";

interface ExplorerViewProps {
  blocks: Block[];
  onRefresh: () => void;
  loading: boolean;
}

export const ExplorerView: React.FC<ExplorerViewProps> = ({ blocks, onRefresh, loading }) => {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredBlocks = blocks.filter(
    (b) =>
      b.hash.toLowerCase().includes(searchTerm.toLowerCase()) ||
      parseInt(b.number, 16).toString().includes(searchTerm) ||
      b.miner.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header and Search */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-2">
              <Compass className="w-5 h-5 text-white" />
              <span>Rogue Signal Mini Explorer</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              Inspect on-chain blocks, transactions, LWMA-1 difficulty adjustments, and gas metrics.
            </p>
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center space-x-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-[2px] text-xs font-mono transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-white" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value.trim())}
            placeholder="Search by block height, hash, or miner address..."
            className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] pl-10 pr-4 py-2 text-xs font-mono text-white outline-none transition"
          />
        </div>
      </div>

      {/* Block List */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-[2px] overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-white" />
            <h2 className="text-xs font-bold text-white uppercase tracking-wider">Recent Blocks ({filteredBlocks.length})</h2>
          </div>
        </div>

        <div className="divide-y divide-zinc-800/60 font-mono text-xs">
          {filteredBlocks.length > 0 ? (
            filteredBlocks.map((b) => {
              const height = parseInt(b.number, 16);
              const gasUsed = parseInt(b.gasUsed, 16);
              const gasLimit = parseInt(b.gasLimit, 16);
              const gasPct = gasLimit > 0 ? ((gasUsed / gasLimit) * 100).toFixed(1) : "0";
              const date = new Date(parseInt(b.timestamp, 16) * 1000).toLocaleTimeString();

              return (
                <div key={b.hash} className="p-4 hover:bg-zinc-900/60 transition space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <span className="text-white font-bold text-sm">#{height}</span>
                      <span className="text-zinc-500 text-[11px]">{date}</span>
                    </div>
                    <div className="text-[11px] px-2 py-0.5 rounded bg-zinc-950 border border-zinc-800 text-zinc-400">
                      Difficulty: {parseInt(b.difficulty, 16).toLocaleString()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-zinc-400 text-[11px]">
                    <div className="truncate">
                      <span className="text-zinc-500">Hash: </span>
                      <span className="text-zinc-300">{b.hash}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-zinc-500">Miner: </span>
                      <span className="text-zinc-300">{b.miner}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-1">
                    <div>
                      <span>Gas Used: </span>
                      <span className="text-zinc-300">
                        {gasUsed.toLocaleString()} ({gasPct}%)
                      </span>
                    </div>
                    <div>
                      <span>Transactions: </span>
                      <span className="text-white font-bold">{b.transactions.length}</span>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-zinc-500 text-xs">
              No blocks found matching criteria or node still bootstrapping.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
