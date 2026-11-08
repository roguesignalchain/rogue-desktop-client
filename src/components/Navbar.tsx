import React from "react";
import { Activity, ShieldCheck, ShieldAlert, Radio, RefreshCw, CheckCircle2 } from "lucide-react";
import { NodeStatus, SyncStatus } from "../types";

interface NavbarProps {
  nodeStatus: NodeStatus;
  syncStatus: SyncStatus;
  rpcConnected: boolean;
  peerCount: number;
  currentBlock: number;
  unlockedAddress: string | null;
  onOpenWalletModal: () => void;
  onLockWallet: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  nodeStatus,
  syncStatus,
  rpcConnected,
  peerCount,
  currentBlock,
  unlockedAddress,
  onOpenWalletModal,
  onLockWallet,
}) => {
  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
      {/* Brand & Network info */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-rose-500 animate-pulse shadow-[0_0_8px_#f43f5e]" />
          <span className="font-black text-lg tracking-wider bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">
            ROGUE SIGNAL
          </span>
        </div>
        <div className="text-xs px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center space-x-1.5 font-mono">
          <Radio className="w-3.5 h-3.5 text-rose-400" />
          <span>Chain ID: 800055</span>
        </div>
      </div>

      {/* Dynamic Sync Status & Block tracker */}
      <div className="flex items-center space-x-5">
        {/* Dynamic Network / Sync Badge */}
        {!nodeStatus.running ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-950/30 border border-red-900/40 rounded-full text-xs font-mono text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Node Offline</span>
          </div>
        ) : !rpcConnected ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-950/30 border border-cyan-800/40 rounded-full text-xs font-mono text-cyan-300">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>Connecting RPC...</span>
          </div>
        ) : peerCount === 0 ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/30 border border-amber-900/40 rounded-full text-xs font-mono text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Connecting...</span>
          </div>
        ) : syncStatus.isSyncing ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-950/30 border border-cyan-800/40 rounded-full text-xs font-mono text-cyan-300">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>Syncing {syncStatus.progressPercentage}%</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/50 rounded-full text-xs font-mono text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Synced</span>
          </div>
        )}

        <div className="flex items-center space-x-2 text-xs font-mono">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-zinc-400">Height:</span>
          <span className="text-cyan-400 font-bold">#{currentBlock}</span>
        </div>

        {/* Wallet status button */}
        {unlockedAddress ? (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1.5 px-3 py-1 bg-emerald-950/40 border border-emerald-800/50 rounded text-xs text-emerald-300 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                {unlockedAddress.slice(0, 6)}...{unlockedAddress.slice(-4)}
              </span>
            </div>
            <button
              onClick={onLockWallet}
              className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-400 hover:text-zinc-200 rounded transition"
            >
              Lock
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenWalletModal}
            className="flex items-center space-x-1.5 px-3 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded text-xs text-zinc-300 transition"
          >
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Unlock Wallet</span>
          </button>
        )}
      </div>
    </header>
  );
};
