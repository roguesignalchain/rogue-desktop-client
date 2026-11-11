import React from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Wallet,
  Pickaxe,
  Compass,
  Terminal,
  Settings,
  RefreshCw,
  Activity,
} from "lucide-react";
import { NodeStatus, SyncStatus } from "../types";

export type TabType = "dashboard" | "wallet" | "mining" | "explorer" | "console" | "settings";

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
  syncStatus: SyncStatus;
  currentBlock: number;
  nodeStatus: NodeStatus;
  rpcConnected: boolean;
  peerCount: number;
  onRetryPeers?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  syncStatus,
  currentBlock,
  nodeStatus,
  rpcConnected,
  peerCount,
  onRetryPeers,
}) => {
  const { t } = useTranslation();

  const navItems = [
    { id: "dashboard", label: t("common.dashboard"), icon: LayoutDashboard },
    { id: "wallet", label: t("common.wallet"), icon: Wallet },
    { id: "mining", label: t("common.mining"), icon: Pickaxe },
    { id: "explorer", label: t("common.explorer"), icon: Compass },
    { id: "console", label: t("common.console"), icon: Terminal },
    { id: "settings", label: t("common.settings"), icon: Settings },
  ];

  return (
    <aside className="w-60 border-r border-white/10 bg-black flex flex-col justify-between p-3 select-none relative z-10 shrink-0 overflow-y-auto">
      {/* Navigation tabs */}
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as TabType)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-[2px] text-xs font-mono uppercase tracking-wider transition ${
                isActive
                  ? "bg-white text-black font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                  : "text-zinc-400 hover:text-white hover:bg-white/5 border border-transparent"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-black" : "text-zinc-400"}`} />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom Info Panels */}
      <div className="space-y-2 mt-4">
        {/* Consensus Specs Card */}
        <div className="p-2.5 bg-[#0A0A0C] rounded-[2px] border border-white/10 text-[10px] text-zinc-400 space-y-1 font-mono">
          <div className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold">
            {t("consensus.title")}
          </div>
          <div className="flex justify-between">
            <span>{t("consensus.algo")}</span>
            <span className="text-white font-bold">{t("consensus.algoValue")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("consensus.daa")}</span>
            <span className="text-white">{t("consensus.daaValue")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("consensus.blockTarget")}</span>
            <span className="text-white">{t("consensus.blockTargetValue")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("consensus.reward")}</span>
            <span className="text-white">{t("consensus.rewardValue")}</span>
          </div>
          <div className="flex justify-between">
            <span>{t("consensus.security")}</span>
            <span className="text-white">{t("consensus.securityValue")}</span>
          </div>
        </div>

        {/* Relocated Compact Blockchain Sync & Height Widget */}
        <div className="p-2.5 bg-[#0A0A0C] rounded-[2px] border border-white/15 text-[10px] text-zinc-300 space-y-1.5 font-mono shadow-[0_0_10px_rgba(255,255,255,0.02)]">
          <div className="flex items-center justify-between">
            <span className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold">
              {t("sidebar.syncAndNetwork")}
            </span>
            <div className="flex items-center space-x-1">
              <Activity className="w-3 h-3 text-white" />
              <span className="text-white font-bold text-[11px]">#{currentBlock}</span>
            </div>
          </div>

          {/* Sync Status Badge */}
          {!rpcConnected && !nodeStatus.running ? (
            <div className="flex items-center space-x-2 py-1 px-1.5 bg-black border border-white/10 rounded-[1px] text-zinc-500">
              <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
              <span className="truncate">{t("sync.nodeOffline")}</span>
            </div>
          ) : !rpcConnected ? (
            <div className="flex items-center space-x-2 py-1 px-1.5 bg-zinc-950 border border-white/20 rounded-[1px] text-zinc-300">
              <RefreshCw className="w-3 h-3 text-white animate-spin shrink-0" />
              <span className="truncate">{t("sync.connectingRpc")}</span>
            </div>
          ) : peerCount === 0 ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-2 py-1 px-1.5 bg-zinc-950 border border-white/20 rounded-[1px] text-zinc-300">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse shrink-0" />
                <span className="truncate">{t("sync.searchingPeers")}</span>
              </div>
              {onRetryPeers && (
                <button
                  onClick={onRetryPeers}
                  className="w-full text-[9px] py-0.5 bg-zinc-900 hover:bg-white/10 text-zinc-300 hover:text-white rounded-[1px] border border-white/15 transition flex items-center justify-center space-x-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>{t("sidebar.retryBootnodes")}</span>
                </button>
              )}
            </div>
          ) : syncStatus.isSyncing ? (
            <div className="space-y-1">
              <div className="flex items-center space-x-2 py-1 px-1.5 bg-zinc-900 border border-white/30 rounded-[1px] text-white">
                <RefreshCw className="w-3 h-3 text-white animate-spin shrink-0" />
                <span className="truncate">
                  {syncStatus.peersAhead
                    ? t("sync.verifying")
                    : t("sync.syncing", { progress: syncStatus.progressPercentage })}
                </span>
              </div>
              <div className="w-full bg-black border border-white/10 h-1.5 rounded-[1px] overflow-hidden">
                <div
                  className="bg-white h-full transition-all duration-300"
                  style={{ width: `${syncStatus.progressPercentage}%` }}
                />
              </div>
            </div>
          ) : currentBlock === 0 ? (
            <div className="flex items-center space-x-2 py-1 px-1.5 bg-zinc-950 border border-white/20 rounded-[1px] text-zinc-300">
              <RefreshCw className="w-3 h-3 text-white animate-spin shrink-0" />
              <span className="truncate">{t("sync.startingChain")}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between py-1 px-1.5 bg-white/10 border border-white/30 rounded-[1px] text-white font-bold">
              <div className="flex items-center space-x-1.5 truncate">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse shrink-0" />
                <span>{t("sync.synced")}</span>
              </div>
              <span className="text-[9px] text-zinc-400 font-normal">
                {peerCount} {t("common.peers").toLowerCase()}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
