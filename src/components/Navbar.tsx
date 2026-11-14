import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  ShieldAlert,
  ChevronDown,
  ChevronRight,
  Wallet,
  ArrowLeftRight,
  Plus,
  Download,
  Lock,
  Settings,
  Pickaxe,
  Compass,
  Terminal,
  Trash2,
  Check,
  Award,
  Zap,
  RefreshCw,
  Activity,
  Info,
} from "lucide-react";
import { WalletSummary, AccountInfo, MinerGamificationStats, RankInfo, NodeStatus, SyncStatus } from "../types";
import { TabType } from "./Sidebar";
import { VoxelAvatar } from "./VoxelAvatar";
import { LanguageSelector } from "./LanguageSelector";

interface NavbarProps {
  currentTab: TabType;
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  allWallets: WalletSummary[];
  derivedAccounts: AccountInfo[];
  minerStats: MinerGamificationStats | null;
  ranks?: RankInfo[];
  syncStatus: SyncStatus;
  currentBlock: number;
  nodeStatus: NodeStatus;
  rpcConnected: boolean;
  peerCount: number;
  onRetryPeers?: () => void;
  onSelectTab: (tab: TabType) => void;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onLockWallet: () => void;
  onSelectWallet: (walletId: string) => void;
  onSelectAddress: (address: string) => void;
  onRemoveWallet: (walletId: string) => void;
  onRefreshMetrics?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  unlockedAddress,
  activeWallet,
  allWallets,
  derivedAccounts,
  minerStats,
  ranks = [],
  syncStatus,
  currentBlock,
  nodeStatus,
  rpcConnected,
  peerCount,
  onRetryPeers,
  onSelectTab,
  onOpenWalletModal,
  onLockWallet,
  onSelectWallet,
  onSelectAddress,
  onRemoveWallet,
  onRefreshMetrics,
}) => {
  const { t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expandedWalletId, setExpandedWalletId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleToggleDropdown = () => {
    const next = !dropdownOpen;
    setDropdownOpen(next);
    if (next && onRefreshMetrics) {
      onRefreshMetrics();
    }
  };

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

  const [accountMetaMap, setAccountMetaMap] = useState<
    Record<string, { name?: string; categoryId?: string; order?: number }>
  >({});

  // Keep expanded wallet and saved account metadata in sync with active wallet
  useEffect(() => {
    if (activeWallet) {
      setExpandedWalletId(activeWallet.id);
    }

    const loadAccountMeta = () => {
      if (!activeWallet?.id) {
        setAccountMetaMap({});
        return;
      }
      try {
        const raw = localStorage.getItem(`rogue_account_meta_${activeWallet.id}`);
        setAccountMetaMap(raw ? JSON.parse(raw) : {});
      } catch {
        setAccountMetaMap({});
      }
    };

    loadAccountMeta();
    window.addEventListener("rogue-account-meta-updated", loadAccountMeta);
    window.addEventListener("storage", loadAccountMeta);
    return () => {
      window.removeEventListener("rogue-account-meta-updated", loadAccountMeta);
      window.removeEventListener("storage", loadAccountMeta);
    };
  }, [activeWallet, unlockedAddress, dropdownOpen]);

  const level = minerStats?.level ?? 0;
  const rankTitle =
    minerStats?.title ??
    ranks.find((r) => r.level === level)?.title ??
    "Unranked Runner";
  const progressPercent = minerStats?.progressPercent ?? 0;
  const activeAccount = derivedAccounts.find(
    (acc) => acc.address.toLowerCase() === unlockedAddress?.toLowerCase()
  );
  const savedAccountName = unlockedAddress
    ? accountMetaMap[unlockedAddress.toLowerCase()]?.name
    : undefined;
  const activeAccountName =
    savedAccountName ||
    activeAccount?.name ||
    (activeAccount
      ? activeAccount.index === 0
        ? t("wallet.mainAccount")
        : t("wallet.accountNumber", { index: activeAccount.index + 1 })
      : activeWallet?.name || t("common.wallet"));

  const quickNavItems: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "wallet", label: t("common.wallet"), icon: Wallet },
    { id: "transfers", label: t("common.transfers"), icon: ArrowLeftRight },
    { id: "mining", label: t("common.mining"), icon: Pickaxe },
    { id: "explorer", label: t("common.explorer"), icon: Compass },
    { id: "console", label: t("common.console"), icon: Terminal },
    { id: "settings", label: t("common.settings"), icon: Settings },
  ];

  const quickNavButtons = (
    <div className="flex items-center space-x-1.5">
      {quickNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onSelectTab(item.id)}
            title={item.label}
            aria-label={item.label}
            className={`h-10 w-10 flex items-center justify-center rounded-[2px] border transition ${isActive
                ? "bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.15)]"
                : "bg-[#0A0A0C] hover:bg-zinc-900 border-white/15 hover:border-white/40 text-zinc-400 hover:text-white"
              }`}
          >
            <Icon className="w-4 h-4" />
          </button>
        );
      })}
    </div>
  );

  const syncStatusWidget = (
    <div className="h-10 px-3 bg-[#0A0A0C] border border-white/15 rounded-[2px] flex items-center space-x-2.5 font-mono">
      {!rpcConnected && !nodeStatus.running ? (
        <div className="flex items-center space-x-2 text-zinc-500">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-600 shrink-0" />
          <div className="flex flex-col justify-center leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">
              {t("sync.nodeOffline")}
            </span>
            <span className="text-[9px] text-zinc-600 uppercase tracking-wider">
              {t("sidebar.syncAndNetwork")}
            </span>
          </div>
        </div>
      ) : !rpcConnected ? (
        <div className="flex items-center space-x-2 text-zinc-300">
          <RefreshCw className="w-3.5 h-3.5 text-white animate-spin shrink-0" />
          <div className="flex flex-col justify-center leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">
              {t("sync.connectingRpc")}
            </span>
            <span className="text-[9px] text-zinc-400 uppercase tracking-wider">
              {t("sidebar.syncAndNetwork")}
            </span>
          </div>
        </div>
      ) : peerCount === 0 ? (
        <div className="flex items-center space-x-2 text-zinc-300">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse shrink-0" />
          <div className="flex flex-col justify-center leading-tight">
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">
              {t("sync.searchingPeers")}
            </span>
            <span className="text-[9px] text-zinc-400">
              0 {t("common.peers").toLowerCase()}
            </span>
          </div>
          {onRetryPeers && (
            <button
              onClick={onRetryPeers}
              title={t("sidebar.retryBootnodes")}
              aria-label={t("sidebar.retryBootnodes")}
              className="p-1 bg-zinc-900 hover:bg-white/10 text-zinc-300 hover:text-white rounded-[2px] border border-white/15 transition"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          )}
        </div>
      ) : syncStatus.isSyncing ? (
        <div className="flex items-center space-x-2 text-yellow-300">
          <RefreshCw className="w-3.5 h-3.5 text-yellow-400 animate-spin shrink-0" />
          <div className="flex flex-col justify-center leading-tight min-w-[84px]">
            <span className="text-[10px] font-bold uppercase tracking-wider truncate">
              {syncStatus.peersAhead
                ? t("sync.verifying")
                : t("sync.syncing", { progress: syncStatus.progressPercentage })}
            </span>
            <div className="w-full bg-black border border-yellow-500/25 h-1 rounded-[1px] overflow-hidden mt-1">
              <div
                className="bg-yellow-400 h-full transition-all duration-300"
                style={{ width: `${syncStatus.progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center space-x-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
          <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
            {t("sync.synced")}
          </span>
          <span className="text-[10px] text-zinc-400 whitespace-nowrap pl-2.5 border-l border-white/10">
            {peerCount} {t("common.peers").toLowerCase()}
          </span>
        </div>
      )}

      <div className="flex items-center space-x-1.5 pl-2.5 border-l border-white/10">
        <Activity className="w-3.5 h-3.5 text-white shrink-0" />
        <span className="text-[11px] font-bold text-white">#{currentBlock}</span>
        <div className="relative group flex items-center">
          <button
            type="button"
            aria-label={t("consensus.title")}
            className="text-zinc-400 hover:text-white focus:text-white focus:outline-none transition flex items-center justify-center"
          >
            <Info className="w-3.5 h-3.5 shrink-0" />
          </button>
          <div className="absolute right-0 top-full mt-2.5 w-56 z-50 opacity-0 invisible pointer-events-none group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all duration-150">
            <div className="p-2.5 bg-[#0A0A0C] rounded-[2px] border border-white/15 shadow-2xl text-[10px] text-zinc-400 space-y-1 font-mono">
              <div className="text-zinc-500 uppercase tracking-widest text-[9px] font-bold pb-1 border-b border-white/10">
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
        </div>
      </div>
    </div>
  );

  return (
    <header className="h-14 border-b border-white/10 bg-black px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Left Side: Brand Logo, Title & Language Selector */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 flex items-center justify-center">
            <img src="/icon.png" alt="Rogue Signal" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-base tracking-wider text-white font-display">
            {t("common.appName")}
          </span>
        </div>

        {/* Language Selector (EN, ES, ZH with Flags) */}
        <LanguageSelector />
      </div>

      {/* Right Side: User Card, Quick Navigation & Lock/Unlock */}
      <div className="flex items-center space-x-2">
        {unlockedAddress ? (
          <>
            {/* User Card (Avatar without level, Address Name, Address) */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={handleToggleDropdown}
                className="h-10 flex items-center space-x-2.5 px-3 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/15 hover:border-white/40 rounded-[2px] text-xs transition group"
              >
                <VoxelAvatar seed={unlockedAddress} size={24} className="border border-white/20 shrink-0" />

                <div className="flex flex-col items-start justify-center leading-tight">
                  <span className="font-bold text-white text-[11px] group-hover:text-zinc-200 transition max-w-[120px] truncate">
                    {activeAccountName}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {unlockedAddress.slice(0, 6)}...{unlockedAddress.slice(-4)}
                  </span>
                </div>

                <ChevronDown
                  className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${dropdownOpen ? "rotate-180" : ""
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
                          const fallbackThresholds = ["0", "1", "25", "100", "500", "2.5K", "10K+"];
                          const onChainRank = ranks.find((r) => r.level === tier);
                          const formatMinBlocks = (n: number) =>
                            n >= 1000 ? `${n / 1000}K${tier === 6 ? "+" : ""}` : String(n);
                          const thresholdLabel = onChainRank
                            ? formatMinBlocks(onChainRank.minBlocks)
                            : fallbackThresholds[tier];
                          const tierTooltip = onChainRank
                            ? `${onChainRank.title} — ${t("gamification.tierTooltip", { tier, blocks: thresholdLabel })}`
                            : t("gamification.tierTooltip", { tier, blocks: thresholdLabel });
                          return (
                            <div
                              key={tier}
                              className={`flex flex-col items-center p-1 rounded-[2px] transition ${isCurrent
                                  ? "bg-white/15 border border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.2)]"
                                  : isUnlocked
                                    ? "bg-black border border-white/10"
                                    : "bg-black/60 border border-white/5 opacity-35 grayscale"
                                }`}
                              title={tierTooltip}
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
                                {thresholdLabel}
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
                          className={`rounded-[2px] border transition ${isWalletActive
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
                                  setDropdownOpen(false);
                                  onRemoveWallet(w.id);
                                }}
                                className="p-1.5 rounded-[2px] transition ml-1.5 text-zinc-500 hover:text-white hover:bg-zinc-900"
                                title={t("common.delete")}
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
                                    className={`flex items-center justify-between p-1.5 rounded-[2px] text-xs font-mono cursor-pointer transition ${isAccountActive
                                        ? "bg-white text-black font-bold"
                                        : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                      }`}
                                  >
                                    <div className="flex items-center space-x-1.5 truncate">
                                      <span className="text-[10px]">#{acc.index + 1}</span>
                                      <span className="truncate">
                                        {accountMetaMap[acc.address.toLowerCase()]?.name ||
                                          acc.name ||
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

            {/* Quick Navigation Icon Buttons (Mining, Explorer, Console, Settings) */}
            {quickNavButtons}

            {/* Quick Screen Lock Button */}
            <button
              onClick={onLockWallet}
              title={`${t("common.lockVault")} (Ctrl+L)`}
              className="h-10 w-10 flex items-center justify-center bg-[#0A0A0C] hover:bg-zinc-900 border border-white/15 hover:border-white/40 rounded-[2px] text-zinc-400 hover:text-white transition"
            >
              <Lock className="w-4 h-4" />
            </button>

            {/* Sync & Network Status */}
            {syncStatusWidget}
          </>
        ) : (
          <div className="flex items-center space-x-2">
            {quickNavButtons}
            <button
              onClick={() => onOpenWalletModal("unlock")}
              className="h-10 flex items-center space-x-1.5 px-3 bg-white text-black font-bold hover:bg-zinc-200 border border-white rounded-[2px] text-xs transition shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            >
              <ShieldAlert className="w-4 h-4 text-black" />
              <span>{t("common.unlockWallet")}</span>
            </button>
            {syncStatusWidget}
          </div>
        )}
      </div>
    </header>
  );
};
