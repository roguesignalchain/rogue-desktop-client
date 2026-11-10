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
    { id: "mining", label: "Minería CPU", icon: Pickaxe },
    { id: "explorer", label: "Mini Explorer", icon: Compass },
    { id: "console", label: "Node Console", icon: Terminal },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <aside className="w-56 border-r border-white/10 bg-black flex flex-col justify-between p-3 select-none relative z-10 shrink-0">
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
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Network Specs Quick Info */}
      <div className="p-3 bg-[#0A0A0C] rounded-[2px] border border-white/10 text-[11px] text-zinc-400 space-y-1 font-mono">
        <div className="text-zinc-500 uppercase tracking-widest text-[10px] font-bold">[CONSENSUS SPEC]</div>
        <div className="flex justify-between">
          <span>Algo:</span>
          <span className="text-white font-bold">rx/0 (RandomX)</span>
        </div>
        <div className="flex justify-between">
          <span>DAA:</span>
          <span className="text-white">LWMA-1 (N=60)</span>
        </div>
        <div className="flex justify-between">
          <span>Block Target:</span>
          <span className="text-white">30s</span>
        </div>
        <div className="flex justify-between">
          <span>Reward:</span>
          <span className="text-white">25 ROGUE (95/5)</span>
        </div>
        <div className="flex justify-between">
          <span>Security:</span>
          <span className="text-white">MESS + Reorg≤90</span>
        </div>
      </div>
    </aside>
  );
};
