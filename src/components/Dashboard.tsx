import React from "react";
import {
  Coins,
  HardDrive,
  Cpu,
  Users,
  ArrowUpRight,
  Zap,
  CheckCircle2,
  RefreshCw,
  Radio,
} from "lucide-react";
import { Block, NodeStatus, SyncStatus } from "../types";

interface DashboardProps {
  balance: string;
  currentBlock: number;
  hashrate: number;
  peerCount: number;
  nodeStatus: NodeStatus;
  syncStatus: SyncStatus;
  recentBlocks: Block[];
  onNavigate: (tab: "wallet" | "mining" | "explorer" | "settings") => void;
  onRetryPeers?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  balance,
  currentBlock,
  hashrate,
  peerCount,
  nodeStatus,
  syncStatus,
  recentBlocks,
  onNavigate,
  onRetryPeers,
}) => {
  return (
    <div className="space-y-6">
      {/* Top Banner with Real-Time Blockchain Synchronization */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-6 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 border border-zinc-800 rounded-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold text-white tracking-wide">Rogue Signal Node Dashboard</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Tu nodo local Core-Geth se ejecuta automáticamente en segundo plano para mantener la blockchain sincronizada sin interrumpir tus operaciones.
          </p>
        </div>

        {/* Synchronization Status Widget (Decoupled from manual start/stop) */}
        <div className="w-full md:w-80 bg-zinc-950/70 border border-zinc-800 rounded-lg p-3.5 backdrop-blur-sm shadow-inner shrink-0">
          {!nodeStatus.running ? (
            <div className="flex items-center space-x-3 py-1">
              <div className="w-8 h-8 rounded-full bg-red-950/60 border border-red-800/50 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4 text-red-400" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-red-400 uppercase tracking-wider block">
                  Nodo Inactivo
                </span>
                <p className="text-[11px] text-zinc-500 truncate">
                  Configúralo o inícialo desde Settings.
                </p>
              </div>
            </div>
          ) : peerCount === 0 ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                    Buscando Pares
                  </span>
                </div>
                <span className="text-[10px] bg-amber-950/50 text-amber-300 border border-amber-800/60 px-2 py-0.5 rounded font-mono">
                  0 Pares P2P
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Conectando con bootnodes oficiales para descubrir pares en la red...
              </p>
              {onRetryPeers && (
                <button
                  onClick={onRetryPeers}
                  className="w-full text-[11px] py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded border border-zinc-700/60 transition flex items-center justify-center space-x-1"
                >
                  <RefreshCw className="w-3 h-3 text-amber-400" />
                  <span>Reintentar Conexión</span>
                </button>
              )}
            </div>
          ) : syncStatus.isSyncing ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
                  <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                    Sincronizando Cadena
                  </span>
                </div>
                <span className="text-xs font-bold text-cyan-300 font-mono">
                  {syncStatus.progressPercentage}%
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-2 rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${Math.max(3, syncStatus.progressPercentage)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400">
                <span>Bloque: #{syncStatus.currentBlock || currentBlock}</span>
                <span className="text-zinc-500">/</span>
                <span className="text-cyan-400 font-bold">Pico: #{syncStatus.highestBlock}</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center space-x-3 py-1">
              <div className="w-9 h-9 rounded-full bg-emerald-950/80 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(16,185,129,0.25)]">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                    Red Sincronizada
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                  Bloque #{currentBlock} • {peerCount} {peerCount === 1 ? "par activo" : "pares activos"}
                </p>
              </div>
            </div>
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
