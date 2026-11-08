import React from "react";
import { LayoutDashboard, Wallet, Pickaxe, Compass, Terminal, Settings } from "lucide-react";

export type TabType = "dashboard" | "wallet" | "mining" | "explorer" | "console" | "settings";

interface SidebarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "wallet", label: "Wallet", icon: Wallet },
    { id: "mining", label: "Mining & Stratum", icon: Pickaxe },
    { id: "explorer", label: "Mini Explorer", icon: Compass },
    { id: "console", label: "Node Console", icon: Terminal },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-56 border-r border-zinc-800 bg-zinc-950 flex flex-col justify-between p-3 select-none relative z-10 shrink-0">
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id as TabType)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                isActive
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30 shadow-sm"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-rose-400" : "text-zinc-400"}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Network Specs Quick Info */}
      <div className="p-3 bg-zinc-900/40 rounded-lg border border-zinc-800 text-[11px] text-zinc-400 space-y-1 font-mono">
        <div className="text-zinc-500 font-sans font-semibold uppercase tracking-wider text-[10px]">Consensus Spec</div>
        <div className="flex justify-between">
          <span>Algo:</span>
          <span className="text-zinc-300">RandomX rx/0</span>
        </div>
        <div className="flex justify-between">
          <span>DAA:</span>
          <span className="text-zinc-300">LWMA-1 (N=60)</span>
        </div>
        <div className="flex justify-between">
          <span>Block Target:</span>
          <span className="text-zinc-300">10s</span>
        </div>
        <div className="flex justify-between">
          <span>Reward:</span>
          <span className="text-zinc-300">8 ROGUE (95/5)</span>
        </div>
      </div>
    </aside>
  );
};

