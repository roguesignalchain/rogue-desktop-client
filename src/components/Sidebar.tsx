import React from "react";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
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
    </aside>
  );
};
