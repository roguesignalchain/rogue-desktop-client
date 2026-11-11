import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Wallet,
  Plus,
  Download,
  Lock,
  Trash2,
  Check,
  Award,
  Zap,
} from "lucide-react";
import { WalletSummary, AccountInfo, MinerGamificationStats } from "../types";
import { VoxelAvatar } from "./VoxelAvatar";
import { LanguageSelector } from "./LanguageSelector";

interface NavbarProps {
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  allWallets: WalletSummary[];
  derivedAccounts: AccountInfo[];
  activeBalance: string;
  minerStats: MinerGamificationStats | null;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onLockWallet: () => void;
  onSelectWallet: (walletId: string) => void;
  onSelectAddress: (address: string) => void;
  onRemoveWallet: (walletId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  unlockedAddress,
  activeWallet,
  allWallets,
  derivedAccounts,
  activeBalance,
  minerStats,
  onOpenWalletModal,
  onLockWallet,
  onSelectWallet,
  onSelectAddress,
  onRemoveWallet,
}) => {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);
  const [walletToDelete, setWalletToDelete] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
    }
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [dropdownOpen]);

  // Keep expanded wallet sync with active wallet
  useEffect(() => {
    if (activeWallet) {
      setExpandedWalletId(activeWallet.id);
    }
  }, [activeWallet]);

  const level = minerStats?.level ?? 0;
  const rankTitle = minerStats?.title ?? t("gamification.titles.level0");
  const progressPercent = minerStats?.progressPercent ?? 0;

  return (
    <header className="h-14 border-b border-white/10 bg-black px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand: Logo & Title only (Clean, no Chain ID, no sync widgets) */}
      <div className="flex items-center space-x-2.5">
        <div className="w-8 h-8 flex items-center justify-center">
          <img src="/icon.png" alt="Rogue Signal" className="w-full h-full object-contain" />
        </div>
        <span className="font-bold text-base tracking-wider text-white font-display">
          ROGUE SIGNAL
        </span>
      </div>

      {/* Right Side: Language Selector + Gamified User Card */}
      <div className="flex items-center space-x-3">
        {/* Language Selector (EN, ES, ZH with Flags) */}
        <LanguageSelector />

        {/* Gamified User Card */}
        {unlockedAddress ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2.5 px-3 py-1.5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/15 hover:border-white/40 rounded-[2px] text-xs transition group"
            >
              {/* Dynamic Offline Voxel Bot Avatar & Current Level Medal */}
              <div className="relative flex items-center space-x-1.5">
                <div className="relative">
                  <VoxelAvatar seed={unlockedAddress} size={28} className="border border-white/20" />
                  <span className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-white text-black font-extrabold text-[8px] rounded-[1px] font-mono leading-tight shadow">
                    L{level}
                  </span>
                </div>
                <img
                  src={`/badges/lvl${Math.min(6, Math.max(0, level))}.png`}
                  alt={`Level ${level}`}
                  className="w-5 h-5 object-contain shrink-0 drop-shadow"
                />
              </div>

              {/* User Identity & Gamified Rank */}
              <div className="flex flex-col items-start leading-tight">
                <div className="flex items-center space-x-1.5">
                  <span className="font-bold text-white text-[11px] group-hover:text-zinc-200 transition">
                    [{rankTitle}]
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {unlockedAddress.slice(0, 6)}...{unlockedAddress.slice(-4)}
                  </span>
                </div>
                <div className="flex items-center space-x-2 mt-0.5">
                  <span className="font-mono text-[10px] text-zinc-300 font-bold">
                    {activeBalance} ROGUE
                  </span>
                  {minerStats && (
                    <span className="text-[9px] font-mono text-zinc-400">
                      • {minerStats.blocksMined} {t("gamification.blocksMined").toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${
                  dropdownOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {/* Dropdown Menu: Gamification Stats + Multi-Wallet Management */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-88 bg-[#0A0A0C] border border-white/20 rounded-[2px] shadow-2xl overflow-hidden z-50 animate-in fade-in duration-100">
                {/* Gamified Profile Header */}
                <div className="p-3.5 bg-zinc-950 border-b border-white/10 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5 text-zinc-400 font-mono text-[10px] uppercase tracking-wider">
                      <Award className="w-3.5 h-3.5 text-white" />
                      <span>{t("gamification.profileTitle")}</span>
                    </div>
                    <span className="px-1.5 py-0.5 bg-white text-black font-extrabold text-[10px] rounded-[1px] font-mono uppercase">
                      {t("gamification.level", { level })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <div className="relative shrink-0">
                      <VoxelAvatar seed={unlockedAddress} size={44} className="border border-white/30" />
                      <img
                        src={`/badges/lvl${Math.min(6, Math.max(0, level))}.png`}
                        alt={`Level ${level}`}
                        className="w-5 h-5 object-contain absolute -bottom-1 -right-1 drop-shadow"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <h4 className="text-sm font-bold text-white truncate font-display tracking-wide">
                          {rankTitle}
                        </h4>
                        <img
                          src={`/badges/lvl${Math.min(6, Math.max(0, level))}.png`}
                          alt=""
                          className="w-4 h-4 object-contain shrink-0"
                        />
                      </div>
                      <p className="text-[11px] font-mono text-zinc-400 truncate">
                        {unlockedAddress}
                      </p>
                      <div className="text-[10px] font-mono text-zinc-300 mt-0.5 flex items-center space-x-1">
                        <Zap className="w-3 h-3 text-white" />
                        <span>
                          {minerStats?.blocksMined ?? 0} {t("gamification.blocksMined")}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* XP Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] font-mono text-zinc-400">
                      <span>{t("gamification.xp")}</span>
                      <span className="text-white font-bold">{progressPercent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-zinc-900 border border-white/10 h-2 rounded-[1px] overflow-hidden">
                      <div
                        className="bg-white h-full transition-all duration-300"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <div className="text-[9px] font-mono text-zinc-500 text-right">
                      {level >= 6
                        ? t("gamification.maxRankReached")
                        : t("gamification.nextLevelAt", { blocks: minerStats?.nextLevelXP ?? 1 })}
                    </div>
                  </div>

                  {/* All Levels Progression Roadmap (with grayed out locked tiers) */}
                  <div className="pt-2 border-t border-white/10 space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
                      <span>{t("gamification.rankRoadmap")}</span>
                      <span className="text-zinc-500">Tier {level} / 6</span>
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {[0, 1, 2, 3, 4, 5, 6].map((tier) => {
                        const isUnlocked = level >= tier;
                        const isCurrent = level === tier;
                        const thresholds = ["0", "1", "25", "100", "500", "2.5K", "10K+"];
                        return (
                          <div
                            key={tier}
                            className={`flex flex-col items-center p-1 rounded-[2px] transition ${
                              isCurrent
                                ? "bg-white/15 border border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                                : isUnlocked
                                ? "bg-black border border-white/10"
                                : "bg-black/60 border border-white/5 opacity-35 grayscale"
                            }`}
                            title={`Nivel ${tier}: ${thresholds[tier]} bloques`}
                          >
                            <img
                              src={`/badges/lvl${tier}.png`}
                              alt={`Tier ${tier}`}
                              className="w-5 h-5 object-contain"
                            />
                            <span className="text-[8px] font-mono text-zinc-200 font-bold mt-0.5">
                              L{tier}
                            </span>
                            <span className="text-[7px] font-mono text-zinc-500">
                              {thresholds[tier]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Wallets Title Bar */}
                <div className="p-2.5 border-b border-white/10 flex items-center justify-between bg-black">
                  <div className="flex items-center space-x-1.5">
                    <Wallet className="w-3.5 h-3.5 text-white" />
                    <span className="text-[11px] font-bold text-white uppercase tracking-wider font-mono">
                      [{t("common.wallets")}]
                    </span>
                  </div>
                  <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded-[2px] font-mono border border-white/10">
                    {allWallets.length}
                  </span>
                </div>

                {/* Wallets & Derived Accounts List */}
                <div className="max-h-64 overflow-y-auto p-2 space-y-1.5">
                  {allWallets.map((w) => {
                    const isWalletActive = activeWallet?.id === w.id;
                    const isExpanded = expandedWalletId === w.id;

                    return (
                      <div
                        key={w.id}
                        className={`rounded-[2px] border transition ${
                          isWalletActive
                            ? "bg-white/10 border-white/40"
                            : "bg-black border-white/10 hover:border-white/25"
                        }`}
                      >
                        <div className="p-2 flex items-center justify-between">
                          <div
                            onClick={() => {
                              onSelectWallet(w.id);
                              setExpandedWalletId(w.id);
                            }}
                            className="flex items-center space-x-2 cursor-pointer flex-1 min-w-0"
                          >
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedWalletId(isExpanded ? null : w.id);
                              }}
                              className="p-0.5 text-zinc-400 hover:text-white"
                            >
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-xs font-bold text-white truncate">{w.name}</span>
                                {isWalletActive && (
                                  <span className="text-[9px] bg-white text-black font-bold px-1 rounded-[1px] font-mono">
                                    {t("common.active")}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-zinc-400 block truncate">
                                {w.primary_address}
                              </span>
                            </div>
                          </div>

                          {allWallets.length > 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (walletToDelete === w.id) {
                                  onRemoveWallet(w.id);
                                  setWalletToDelete(null);
                                } else {
                                  setWalletToDelete(w.id);
                                }
                              }}
                              className={`p-1.5 rounded-[2px] transition ml-1.5 ${
                                walletToDelete === w.id
                                  ? "bg-white text-black font-bold"
                                  : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                              }`}
                              title={walletToDelete === w.id ? "Click to confirm delete" : "Delete"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {isExpanded && isWalletActive && derivedAccounts.length > 0 && (
                          <div className="px-3 pb-2 pt-1 space-y-1 border-t border-white/10 bg-black">
                            <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                              [{t("common.derivedAccounts")} ({derivedAccounts.length})]
                            </span>
                            {derivedAccounts.map((acc) => {
                              const isAccountActive =
                                acc.address.toLowerCase() === unlockedAddress?.toLowerCase();
                              return (
                                <div
                                  key={acc.address}
                                  onClick={() => {
                                    onSelectAddress(acc.address);
                                    setDropdownOpen(false);
                                  }}
                                  className={`flex items-center justify-between p-1.5 rounded-[2px] text-xs font-mono cursor-pointer transition ${
                                    isAccountActive
                                      ? "bg-white text-black font-bold"
                                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <span className="text-[10px]">#{acc.index + 1}</span>
                                    <span className="truncate">
                                      {acc.name ||
                                        `${acc.address.slice(0, 6)}...${acc.address.slice(-4)}`}
                                    </span>
                                  </div>
                                  {isAccountActive && (
                                    <Check className="w-3.5 h-3.5 text-black shrink-0" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Dropdown Actions */}
                <div className="p-2 border-t border-white/10 bg-black space-y-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenWalletModal("create");
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-[2px] text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-white" />
                    <span>{t("common.createNewWallet")}</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenWalletModal("import");
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-[2px] text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                    <span>{t("common.importMnemonic")}</span>
                  </button>

                  <div className="border-t border-white/10 my-1" />

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onLockWallet();
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-[2px] text-xs text-zinc-400 hover:text-white hover:bg-white/10 transition"
                  >
                    <Lock className="w-3.5 h-3.5 text-white" />
                    <span>{t("common.lockVault")}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenWalletModal("unlock")}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-black font-bold hover:bg-zinc-200 border border-white rounded-[2px] text-xs transition shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            >
              <ShieldAlert className="w-4 h-4 text-black" />
              <span>{t("common.unlockWallet")}</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
