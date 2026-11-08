import React from "react";
import { Activity, ShieldCheck, ShieldAlert, Cpu, Radio } from "lucide-react";
import { NodeStatus } from "../types";

interface NavbarProps {
  nodeStatus: NodeStatus;
  currentBlock: number;
  unlockedAddress: string | null;
  onOpenWalletModal: () => void;
  onLockWallet: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  nodeStatus,
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

      {/* Node status & Block tracker */}
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2 text-xs font-mono">
          <Cpu className={`w-4 h-4 ${nodeStatus.running ? "text-emerald-400" : "text-zinc-600"}`} />
          <span className="text-zinc-400">Node:</span>
          <span className={nodeStatus.running ? "text-emerald-400 font-semibold" : "text-zinc-500"}>
            {nodeStatus.running ? `Running (PID: ${nodeStatus.pid})` : "Stopped"}
          </span>
        </div>

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
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded text-xs font-medium shadow-md shadow-rose-900/30 transition"
          >
            <ShieldAlert className="w-4 h-4" />
            <span>Unlock / Create Wallet</span>
          </button>
        )}
      </div>
    </header>
  );
};

