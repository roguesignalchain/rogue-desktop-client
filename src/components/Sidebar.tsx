import React from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
} from "lucide-react";

export type TabType = "dashboard" | "wallet" | "transfers" | "mining" | "explorer" | "console" | "settings";

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
}) => {
  const { t } = useTranslation();

  const navItems = [
    { id: "dashboard", label: t("common.dashboard"), icon: LayoutDashboard },
    { id: "wallet", label: t("common.wallet"), icon: Wallet },
    { id: "transfers", label: t("common.transfers"), icon: ArrowLeftRight },
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
      </div>
    </aside>
  );
};
