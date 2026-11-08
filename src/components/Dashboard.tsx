import React from "react";
import { Coins, HardDrive, Cpu, Users, ArrowUpRight, Zap, Play, Square } from "lucide-react";
import { Block, NodeStatus } from "../types";

interface DashboardProps {
  balance: string;
  currentBlock: number;
  hashrate: number;
  peerCount: number;
  nodeStatus: NodeStatus;
  recentBlocks: Block[];
  onStartNode: () => void;
  onStopNode: () => void;
  onNavigate: (tab: "wallet" | "mining" | "explorer") => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  balance,
  currentBlock,
  hashrate,
  peerCount,
  nodeStatus,
  recentBlocks,
  onStartNode,
  onStopNode,
  onNavigate,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner / Quick Actions */}
      <div className="flex items-center justify-between p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        <div>
          <h1 className="text-2xl font-bold text-white tracking-wide">Rogue Signal Node Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Supervise your local Core-Geth node, RandomX consensus, balance, and network state.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {nodeStatus.running ? (
            <button
              onClick={onStopNode}
              className="flex items-center space-x-2 px-4 py-2 bg-red-950/60 hover:bg-red-900/80 border border-red-800 text-red-200 rounded-lg text-sm font-medium transition"
            >
              <Square className="w-4 h-4 text-red-400 fill-current" />
              <span>Stop Node</span>
            </button>
          ) : (
            <button
              onClick={onStartNode}
              className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium shadow-md shadow-emerald-950 transition"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Start Node</span>
            </button>
          )}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Balance Card */}
        <div
          onClick={() => onNavigate("wallet")}
          className="p-5 bg-zinc-900/50 hover:bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Wallet Balance</span>
            <Coins className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-2">
            <span className="text-2xl font-black text-white">{balance}</span>
            <span className="text-xs font-bold text-amber-400">ROGUE</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-amber-400 transition">
            <span>Manage wallet</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Block Height Card */}
        <div
          onClick={() => onNavigate("explorer")}
          className="p-5 bg-zinc-900/50 hover:bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Block Height</span>
            <HardDrive className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">#{currentBlock}</div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-cyan-400 transition">
            <span>View recent blocks</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Mining Hashrate Card */}
        <div
          onClick={() => onNavigate("mining")}
          className="p-5 bg-zinc-900/50 hover:bg-zinc-900/80 border border-zinc-800 hover:border-zinc-700 rounded-xl transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">Active Hashrate</span>
            <Cpu className="w-5 h-5 text-rose-400" />
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5 font-mono">
            <span className="text-2xl font-black text-white">{hashrate > 0 ? (hashrate / 1000).toFixed(2) : "0.00"}</span>
            <span className="text-xs font-bold text-rose-400">{hashrate > 0 ? "kH/s" : "H/s"}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-rose-400 transition">
            <span>Mining settings</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Peers Card */}
        <div className="p-5 bg-zinc-900/50 border border-zinc-800 rounded-xl">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">P2P Peers</span>
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">{peerCount}</div>
          <div className="mt-2 text-xs text-zinc-500">Port :38888 (DevP2P)</div>
        </div>
      </div>

      {/* Recent Blocks Table Overview */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-rose-500" />
            <h2 className="text-sm font-semibold text-white">Latest Blocks</h2>
          </div>
          <button
            onClick={() => onNavigate("explorer")}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition"
          >
            See all
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-zinc-950/40 text-zinc-400 border-b border-zinc-800/80">
              <tr>
                <th className="py-2.5 px-4">Height</th>
                <th className="py-2.5 px-4">Hash</th>
                <th className="py-2.5 px-4">Miner (Coinbase)</th>
                <th className="py-2.5 px-4">Gas Used / Limit</th>
                <th className="py-2.5 px-4">Txs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50 text-zinc-300">
              {recentBlocks.length > 0 ? (
                recentBlocks.map((b) => (
                  <tr key={b.hash} className="hover:bg-zinc-900/60 transition">
                    <td className="py-2.5 px-4 text-cyan-400 font-semibold">#{parseInt(b.number, 16)}</td>
                    <td className="py-2.5 px-4 text-zinc-400 truncate max-w-xs">{b.hash}</td>
                    <td className="py-2.5 px-4 text-rose-300">{b.miner}</td>
                    <td className="py-2.5 px-4">
                      {parseInt(b.gasUsed, 16)} / {parseInt(b.gasLimit, 16)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-white">{b.transactions.length}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500">
                    No blocks received yet. Ensure your local or remote node is running.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

