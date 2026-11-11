import React from "react";
import {
  Coins,
  HardDrive,
  Cpu,
  Users,
  ArrowUpRight,
  Zap,
} from "lucide-react";
import { Block } from "../types";

interface DashboardProps {
  balance: string;
  currentBlock: number;
  hashrate: number;
  peerCount: number;
  recentBlocks: Block[];
  onNavigate: (tab: "wallet" | "mining" | "explorer" | "settings") => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  balance,
  currentBlock,
  hashrate,
  peerCount,
  recentBlocks,
  onNavigate,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner (Clean, without the sync block which is now in the sidebar) */}
      <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] relative overflow-hidden">
        <div className="max-w-2xl">
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">[LOCAL CORE-GETH NODE]</div>
          <h1 className="text-2xl font-bold text-white tracking-wide font-display">Rogue Signal Node Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1 font-sans">
            Tu nodo local Core-Geth se ejecuta automáticamente en segundo plano para mantener la blockchain sincronizada sin interrumpir tus operaciones.
          </p>
        </div>
      </div>

      {/* 4 Cards Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
        {/* Balance Card */}
        <div
          onClick={() => onNavigate("wallet")}
          className="p-5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/10 hover:border-white/30 rounded-[2px] transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">[WALLET BALANCE]</span>
            <Coins className="w-5 h-5 text-white" />
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5 font-mono">
            <span className="text-2xl font-black text-white">{balance}</span>
            <span className="text-xs font-bold text-zinc-300">ROGUE</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-white transition font-mono">
            <span>Manage wallet & txs</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Block Height Card */}
        <div
          onClick={() => onNavigate("explorer")}
          className="p-5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/10 hover:border-white/30 rounded-[2px] transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">[BLOCK HEIGHT]</span>
            <HardDrive className="w-5 h-5 text-white" />
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">#{currentBlock}</div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-white transition font-mono">
            <span>View recent blocks</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Mining Hashrate Card */}
        <div
          onClick={() => onNavigate("mining")}
          className="p-5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/10 hover:border-white/30 rounded-[2px] transition cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">[ACTIVE HASHRATE]</span>
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div className="mt-3 flex items-baseline space-x-1.5 font-mono">
            <span className="text-2xl font-black text-white">{hashrate > 0 ? (hashrate / 1000).toFixed(2) : "0.00"}</span>
            <span className="text-xs font-bold text-zinc-300">{hashrate > 0 ? "kH/s" : "H/s"}</span>
          </div>
          <div className="mt-2 text-xs text-zinc-500 flex items-center group-hover:text-white transition font-mono">
            <span>Mining settings</span>
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Peers Card */}
        <div className="p-5 bg-[#0A0A0C] border border-white/10 rounded-[2px]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider font-mono">[P2P PEERS]</span>
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="mt-3 text-2xl font-black text-white font-mono">{peerCount}</div>
          <div className="mt-2 text-xs text-zinc-500 font-mono">Port :38890 (DevP2P)</div>
        </div>
      </div>

      {/* Recent Blocks Table Overview */}
      <div className="bg-[#0A0A0C] border border-white/10 rounded-[2px] overflow-hidden">
        <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black">
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-white" />
            <h2 className="text-sm font-semibold text-white font-display uppercase tracking-wider">[LATEST BLOCKS]</h2>
          </div>
          <button
            onClick={() => onNavigate("explorer")}
            className="text-xs font-mono text-zinc-400 hover:text-white transition"
          >
            [SEE ALL →]
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-black text-zinc-400 border-b border-white/10 uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-4">Height</th>
                <th className="py-2.5 px-4">Hash</th>
                <th className="py-2.5 px-4">Miner (Coinbase)</th>
                <th className="py-2.5 px-4">Gas Used / Limit</th>
                <th className="py-2.5 px-4">Txs</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-zinc-300">
              {recentBlocks.length > 0 ? (
                recentBlocks.map((b) => (
                  <tr key={b.hash} className="hover:bg-white/5 transition">
                    <td className="py-2.5 px-4 text-white font-bold">#{parseInt(b.number, 16)}</td>
                    <td className="py-2.5 px-4 text-zinc-400 truncate max-w-xs">{b.hash}</td>
                    <td className="py-2.5 px-4 text-zinc-300">{b.miner}</td>
                    <td className="py-2.5 px-4">
                      {parseInt(b.gasUsed, 16)} / {parseInt(b.gasLimit, 16)}
                    </td>
                    <td className="py-2.5 px-4 font-bold text-white">{b.transactions.length}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-zinc-500 font-mono">
                    No blocks received yet. The node is actively looking for peers to synchronize.
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
