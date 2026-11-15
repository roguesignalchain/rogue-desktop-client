import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Copy,
  Check,
  Shield,
  Eye,
  EyeOff,
  Key,
  Plus,
  AlertTriangle,
  Layers,
  CheckCircle2,
  Pencil,
  Trash2,
  FolderPlus,
  GripVertical,
  Search,
  Lock,
  Download,
  Wallet as WalletIcon,
  Compass,
} from "lucide-react";
import { api } from "../services/api";
import { AccountInfo, ExplorerRoute, WalletSummary, WalletCategory } from "../types";
import { VoxelAvatar } from "./VoxelAvatar";

export interface AccountWithMeta extends AccountInfo {
  balance: string;
  name: string;
  categoryId: string;
  order: number;
}

interface WalletViewProps {
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  allWallets: WalletSummary[];
  balance: string;
  rpcUrl: string;
  onRefreshBalance: () => void;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onSelectWallet: (walletId: string) => void;
  onRemoveWallet: (walletId: string) => void;
  onLockWallet: () => void;
  onSelectAddress?: (address: string) => void;
  onWalletRenamed?: (walletId: string, newName: string) => void;
  onNavigateToTransfers?: () => void;
  onOpenInExplorer?: (route: ExplorerRoute) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  unlockedAddress,
  activeWallet,
  allWallets,
  balance,
  rpcUrl,
  onOpenWalletModal,
  onSelectWallet,
  onRemoveWallet,
  onLockWallet,
  onSelectAddress,
  onWalletRenamed,
  onNavigateToTransfers,
  onOpenInExplorer,
}) => {
  const { t } = useTranslation();

  // Internal sub-tab state
  const [activeSubTab, setActiveSubTab] = useState<"accounts" | "security">("accounts");
  const [searchQuery, setSearchQuery] = useState("");

  // Mnemonic State
  const [mnemonic, setMnemonic] = useState<string>("");
  const [showMnemonic, setShowMnemonic] = useState<boolean>(false);
  const [copiedMnemonic, setCopiedMnemonic] = useState<boolean>(false);
  const [loadingMnemonic, setLoadingMnemonic] = useState<boolean>(false);

  // Derived Accounts State
  const [accounts, setAccounts] = useState<AccountWithMeta[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedPrivKey, setCopiedPrivKey] = useState<number | null>(null);
  const [revealedPrivKeys, setRevealedPrivKeys] = useState<{ [index: number]: string }>({});

  // Categories State
  const [categories, setCategories] = useState<WalletCategory[]>([]);
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [showAddCategory, setShowAddCategory] = useState(false);

  // Editing Account / Wallet Names
  const [editingWalletName, setEditingWalletName] = useState(false);
  const [walletNameInput, setWalletNameInput] = useState("");
  const [editingAccountAddress, setEditingAccountAddress] = useState<string | null>(null);
  const [accountNameInput, setAccountNameInput] = useState("");

  // Drag and Drop State
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [draggedAccountAddress, setDraggedAccountAddress] = useState<string | null>(null);

  // Re-authentication prompt for revealing/copying secrets
  const [secretPrompt, setSecretPrompt] = useState<{
    action: "showMnemonic" | "copyMnemonic" | "showPrivKey" | "copyPrivKey";
    accountIndex?: number;
  } | null>(null);
  const [secretPassword, setSecretPassword] = useState("");
  const [secretError, setSecretError] = useState<string | null>(null);
  const [verifyingSecret, setVerifyingSecret] = useState(false);

  // Load Categories & Metadata from localStorage for active wallet
  useEffect(() => {
    if (!activeWallet) return;

    setWalletNameInput(activeWallet.name);
    setShowMnemonic(false);
    setMnemonic("");
    setRevealedPrivKeys({});

    const catKey = `rogue_categories_${activeWallet.id}`;
    const savedCats = localStorage.getItem(catKey);
    let currentCats: WalletCategory[];
    const defaultCatName = t("wallet.defaultCategory");
    if (savedCats) {
      try {
        currentCats = JSON.parse(savedCats);
      } catch {
        currentCats = [{ id: "cat_default", name: defaultCatName, order: 0 }];
      }
    } else {
      currentCats = [{ id: "cat_default", name: defaultCatName, order: 0 }];
      localStorage.setItem(catKey, JSON.stringify(currentCats));
    }
    setCategories(currentCats);

    loadAccounts(activeWallet.id, currentCats);
  }, [activeWallet?.id, rpcUrl]);

  // Auto-hide revealed secrets in WebView state after 45 seconds
  useEffect(() => {
    const hasRevealedPrivKeys = Object.keys(revealedPrivKeys).length > 0;
    if (!showMnemonic && !hasRevealedPrivKeys) return;

    const timer = setTimeout(() => {
      setShowMnemonic(false);
      setMnemonic("");
      setRevealedPrivKeys({});
    }, 45000);

    return () => clearTimeout(timer);
  }, [showMnemonic, revealedPrivKeys]);

  // Load Derived Accounts & Balances
  const loadAccounts = async (walletId: string, currentCats: WalletCategory[]) => {
    try {
      setLoadingAccounts(true);
      const rawAccounts = await api.getDerivedAccounts(walletId);

      const metaKey = `rogue_account_meta_${walletId}`;
      const savedMetaRaw = localStorage.getItem(metaKey);
      let metaMap: Record<string, { name: string; categoryId: string; order: number }> = {};
      if (savedMetaRaw) {
        try {
          metaMap = JSON.parse(savedMetaRaw);
        } catch {
          metaMap = {};
        }
      }

      const defaultCatId = currentCats[0]?.id || "cat_default";

      const enriched: AccountWithMeta[] = await Promise.all(
        rawAccounts.map(async (acc) => {
          let bal = "0.0000";
          try {
            bal = await api.getBalance(rpcUrl, acc.address);
          } catch {
            bal = "0.0000";
          }

          const meta = metaMap[acc.address.toLowerCase()] || {
            name: acc.index === 0 ? t("wallet.mainAccount") : t("wallet.accountNumber", { index: acc.index + 1 }),
            categoryId: defaultCatId,
            order: acc.index,
          };

          return {
            ...acc,
            balance: bal,
            name: meta.name,
            categoryId: meta.categoryId,
            order: meta.order,
          };
        })
      );

      setAccounts(enriched);
    } catch (err) {
      console.warn("Error loading derived accounts:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Save Account Metadata
  const saveAccountMeta = (updatedAccounts: AccountWithMeta[]) => {
    if (!activeWallet) return;
    const metaKey = `rogue_account_meta_${activeWallet.id}`;
    const metaMap: Record<string, { name: string; categoryId: string; order: number }> = {};
    updatedAccounts.forEach((acc) => {
      metaMap[acc.address.toLowerCase()] = {
        name: acc.name,
        categoryId: acc.categoryId,
        order: acc.order,
      };
    });
    localStorage.setItem(metaKey, JSON.stringify(metaMap));
    window.dispatchEvent(new CustomEvent("rogue-account-meta-updated"));
  };

  // Save Categories
  const saveCategories = (updatedCats: WalletCategory[]) => {
    if (!activeWallet) return;
    setCategories(updatedCats);
    localStorage.setItem(`rogue_categories_${activeWallet.id}`, JSON.stringify(updatedCats));
  };

  const scheduleClipboardClear = (copiedValue: string) => {
    setTimeout(async () => {
      try {
        const current = await navigator.clipboard.readText();
        if (current === copiedValue) {
          await navigator.clipboard.writeText("");
        }
      } catch {
        navigator.clipboard.writeText("").catch(() => {});
      }
    }, 30000);
  };

  const handleConfirmSecretAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secretPrompt || !activeWallet) return;
    try {
      setVerifyingSecret(true);
      setSecretError(null);
      if (secretPrompt.action === "showMnemonic") {
        setLoadingMnemonic(true);
        const phrase = await api.getMnemonic(secretPassword, activeWallet.id);
        setMnemonic(phrase);
        setShowMnemonic(true);
      } else if (secretPrompt.action === "copyMnemonic") {
        const phrase = await api.getMnemonic(secretPassword, activeWallet.id);
        setMnemonic(phrase);
        await navigator.clipboard.writeText(phrase);
        scheduleClipboardClear(phrase);
        setCopiedMnemonic(true);
        setTimeout(() => setCopiedMnemonic(false), 2000);
      } else if (secretPrompt.action === "showPrivKey" && secretPrompt.accountIndex !== undefined) {
        const privKey = await api.getPrivateKey(secretPassword, secretPrompt.accountIndex, activeWallet.id);
        setRevealedPrivKeys((prev) => ({ ...prev, [secretPrompt.accountIndex!]: privKey }));
      } else if (secretPrompt.action === "copyPrivKey" && secretPrompt.accountIndex !== undefined) {
        const privKey = await api.getPrivateKey(secretPassword, secretPrompt.accountIndex, activeWallet.id);
        await navigator.clipboard.writeText(privKey);
        scheduleClipboardClear(privKey);
        setCopiedPrivKey(secretPrompt.accountIndex);
        setTimeout(() => setCopiedPrivKey(null), 2500);
      }
      setSecretPrompt(null);
      setSecretPassword("");
    } catch (err: unknown) {
      setSecretError(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifyingSecret(false);
      setLoadingMnemonic(false);
    }
  };

  // Handle Mnemonic
  const handleToggleMnemonic = async () => {
    if (showMnemonic) {
      setShowMnemonic(false);
      setMnemonic("");
      return;
    }
    setSecretError(null);
    setSecretPassword("");
    setSecretPrompt({ action: "showMnemonic" });
  };

  const handleCopyMnemonic = async () => {
    setSecretError(null);
    setSecretPassword("");
    setSecretPrompt({ action: "copyMnemonic" });
  };

  // Handle Deriving New Account
  const handleDeriveAccount = async () => {
    if (!activeWallet) return;
    const nextCount = accounts.length + 1;
    try {
      setLoadingAccounts(true);
      const rawAccounts = await api.getDerivedAccounts(activeWallet.id, nextCount);
      const defaultCatId = categories[0]?.id || "cat_default";

      const updatedAccounts: AccountWithMeta[] = await Promise.all(
        rawAccounts.map(async (acc) => {
          const existing = accounts.find((a) => a.address.toLowerCase() === acc.address.toLowerCase());
          if (existing) return existing;

          let bal = "0.0000";
          try {
            bal = await api.getBalance(rpcUrl, acc.address);
          } catch {
            bal = "0.0000";
          }

          return {
            ...acc,
            balance: bal,
            name: t("wallet.accountNumber", { index: acc.index + 1 }),
            categoryId: defaultCatId,
            order: acc.index,
          };
        })
      );

      setAccounts(updatedAccounts);
      saveAccountMeta(updatedAccounts);
    } catch (err) {
      console.error("Failed to derive account:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  // Copy Helpers
  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  const handleCopyPrivateKey = async (index: number) => {
    if (!activeWallet) return;
    setSecretError(null);
    setSecretPassword("");
    setSecretPrompt({ action: "copyPrivKey", accountIndex: index });
  };

  const handleToggleRevealPrivateKey = async (index: number) => {
    if (revealedPrivKeys[index]) {
      setRevealedPrivKeys((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } else {
      if (!activeWallet) return;
      setSecretError(null);
      setSecretPassword("");
      setSecretPrompt({ action: "showPrivKey", accountIndex: index });
    }
  };

  // Rename Wallet
  const handleSaveWalletName = async () => {
    if (!activeWallet || !walletNameInput.trim()) return;
    try {
      await api.renameWallet(activeWallet.id, walletNameInput.trim());
      if (onWalletRenamed) onWalletRenamed(activeWallet.id, walletNameInput.trim());
      setEditingWalletName(false);
    } catch (err) {
      console.error("Failed to rename wallet:", err);
    }
  };

  // Rename Account
  const handleSaveAccountName = (address: string) => {
    if (!accountNameInput.trim()) return;
    const updated = accounts.map((a) => {
      if (a.address.toLowerCase() === address.toLowerCase()) {
        return { ...a, name: accountNameInput.trim() };
      }
      return a;
    });
    setAccounts(updated);
    saveAccountMeta(updated);
    setEditingAccountAddress(null);
  };

  // Category Management
  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    const newCat: WalletCategory = {
      id: `cat_${Date.now()}`,
      name: newCategoryName.trim(),
      order: categories.length,
    };
    const updated = [...categories, newCat];
    saveCategories(updated);
    setNewCategoryName("");
    setShowAddCategory(false);
  };

  const handleSaveCategoryName = () => {
    if (!editingCategory || !editingCategory.name.trim()) return;
    const updated = categories.map((c) =>
      c.id === editingCategory.id ? { ...c, name: editingCategory.name.trim() } : c
    );
    saveCategories(updated);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (catId: string) => {
    if (categories.length <= 1) return;
    const remainingCats = categories.filter((c) => c.id !== catId);
    const fallbackCatId = remainingCats[0].id;
    const updatedAccounts = accounts.map((a) =>
      a.categoryId === catId ? { ...a, categoryId: fallbackCatId } : a
    );
    setAccounts(updatedAccounts);
    saveAccountMeta(updatedAccounts);
    saveCategories(remainingCats);
  };

  // Drag & Drop: Categories Reorder
  const handleCategoryDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData("type", "category");
    setDraggedCategoryIndex(index);
  };

  const handleCategoryDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedCategoryIndex === null || draggedCategoryIndex === targetIndex) return;

    const reordered = [...categories];
    const [moved] = reordered.splice(draggedCategoryIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    const updated = reordered.map((c, i) => ({ ...c, order: i }));
    saveCategories(updated);
    setDraggedCategoryIndex(null);
  };

  // Drag & Drop: Accounts Moving / Reordering
  const handleAccountDragStart = (e: React.DragEvent, address: string) => {
    e.stopPropagation();
    e.dataTransfer.setData("type", "account");
    e.dataTransfer.setData("address", address);
    setDraggedAccountAddress(address);
  };

  const handleAccountDropOnCategory = (e: React.DragEvent, targetCatId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const addr = e.dataTransfer.getData("address") || draggedAccountAddress;
    if (!addr) return;

    const updated = accounts.map((a) => {
      if (a.address.toLowerCase() === addr.toLowerCase()) {
        return { ...a, categoryId: targetCatId };
      }
      return a;
    });
    setAccounts(updated);
    saveAccountMeta(updated);
    setDraggedAccountAddress(null);
  };

  const totalVaultBalance = useMemo(() => {
    if (accounts.length === 0) return balance;
    const sum = accounts.reduce((acc, item) => {
      const val = parseFloat(item.balance);
      return acc + (isNaN(val) ? 0 : val);
    }, 0);
    return sum.toFixed(4);
  }, [accounts, balance]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  if (!unlockedAddress || !activeWallet) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/40 border border-zinc-800 rounded-[2px] text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-black border border-white/20 flex items-center justify-center text-white">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">{t("wallet.lockedTitle")}</h2>
        <p className="text-sm text-zinc-400 max-w-md">{t("wallet.lockedDesc")}</p>
        <button
          onClick={() => onOpenWalletModal("unlock")}
          className="px-6 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold transition shadow-[0_0_15px_rgba(255,255,255,0.15)]"
        >
          {t("wallet.unlockInitBtn")}
        </button>
      </div>
    );
  }

  const mnemonicWords = mnemonic ? mnemonic.trim().split(/\s+/) : [];
  const activeAccountObj = accounts.find(
    (a) => a.address.toLowerCase() === unlockedAddress.toLowerCase()
  );

  return (
    <div className="space-y-6">
      {/* Compact Multi-Wallet Switcher & Actions Bar */}
      <div className="p-3 bg-[#0A0A0C] border border-white/10 rounded-[2px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5 flex-1 min-w-[240px]">
          <div className="flex items-center space-x-1.5 text-zinc-400 shrink-0">
            <WalletIcon className="w-4 h-4 text-white" />
            <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-white">
              {t("common.wallets")} ({allWallets.length})
            </span>
          </div>
          <select
            value={activeWallet.id}
            onChange={(e) => onSelectWallet(e.target.value)}
            className="flex-1 max-w-sm bg-zinc-950 border border-white/15 focus:border-white rounded-[2px] px-3 py-1.5 text-xs font-mono text-white outline-none transition cursor-pointer"
          >
            {allWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.primary_address.slice(0, 6)}...{w.primary_address.slice(-4)})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onOpenWalletModal("create")}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-white hover:bg-zinc-200 text-black font-bold rounded-[2px] text-[11px] font-mono uppercase tracking-wider transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t("walletModal.newWallet")}</span>
          </button>
          <button
            onClick={() => onOpenWalletModal("import")}
            className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-200 hover:text-white rounded-[2px] text-[11px] font-mono uppercase tracking-wider transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{t("common.import")}</span>
          </button>
          <button
            onClick={() => setEditingWalletName(true)}
            className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white rounded-[2px] transition"
            title={t("wallet.renameWallet")}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {allWallets.length > 1 && (
            <button
              onClick={() => onRemoveWallet(activeWallet.id)}
              className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-400 hover:text-white rounded-[2px] transition"
              title={t("common.delete")}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onLockWallet}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-zinc-300 hover:text-white rounded-[2px] text-[11px] font-mono uppercase tracking-wider transition"
            title={`${t("common.lockVault")} (Ctrl+L)`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t("common.lock")}</span>
          </button>
        </div>
      </div>

      {/* Active Wallet & Active Account Hero Card */}
      <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Left: Wallet Name & Selected Address */}
          <div className="space-y-2 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              {editingWalletName ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={walletNameInput}
                    onChange={(e) => setWalletNameInput(e.target.value)}
                    className="bg-zinc-950 border border-white rounded-[2px] px-2.5 py-1 text-sm font-bold text-white outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveWalletName}
                    className="text-xs bg-white hover:bg-zinc-200 text-black font-bold px-2.5 py-1 rounded-[2px] transition"
                  >
                    {t("common.save")}
                  </button>
                  <button
                    onClick={() => setEditingWalletName(false)}
                    className="text-xs text-zinc-400 hover:text-white px-1.5 py-1"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h1 className="text-xl font-black text-white tracking-tight">
                    {activeWallet.name}
                  </h1>
                  <button
                    onClick={() => setEditingWalletName(true)}
                    className="p-1 text-zinc-500 hover:text-zinc-200 transition"
                    title={t("wallet.renameWallet")}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-mono">
                {t("wallet.activeWalletBadge")}
              </span>
            </div>

            <div className="flex items-center flex-wrap gap-2 font-mono text-xs">
              <span className="text-zinc-400 font-sans font-semibold">
                {t("wallet.selectedAddress")}
              </span>
              {activeAccountObj && (
                <span className="text-zinc-200 font-sans font-semibold bg-zinc-900 px-2 py-0.5 rounded-[2px] border border-zinc-800">
                  {activeAccountObj.name}
                </span>
              )}
              <span className="bg-zinc-950 px-2.5 py-1 rounded-[2px] border border-zinc-800 text-zinc-200 select-all break-all">
                {unlockedAddress}
              </span>
              <button
                onClick={() => handleCopyAddress(unlockedAddress)}
                className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-[2px] transition"
                title={t("wallet.copyActiveAddress")}
              >
                {copiedAddress === unlockedAddress ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              {onOpenInExplorer && (
                <button
                  onClick={() => onOpenInExplorer({ view: "address", address: unlockedAddress })}
                  className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-[2px] transition"
                  title={t("explorer.inspectInExplorer", "Inspect in Explorer")}
                >
                  <Compass className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="text-[11px] text-zinc-500 font-mono">{t("wallet.bip44Notice")}</div>
          </div>

          {/* Right: Balances + Quick Transfer CTA */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-4 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-zinc-800/80">
            <div className="flex items-baseline gap-6 lg:justify-end">
              <div className="lg:text-right">
                <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider font-mono">
                  {t("wallet.totalWalletBalance")}
                </div>
                <div className="text-base font-bold text-zinc-300 font-mono mt-0.5">
                  {totalVaultBalance} <span className="text-[11px] text-zinc-500">ROGUE</span>
                </div>
              </div>

              <div className="lg:text-right">
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                  {t("wallet.addressBalance")}
                </div>
                <div className="text-3xl font-black text-white font-mono mt-0.5">
                  {balance} <span className="text-sm font-bold text-zinc-400">ROGUE</span>
                </div>
              </div>
            </div>

            {onNavigateToTransfers && (
              <button
                onClick={onNavigateToTransfers}
                className="flex items-center space-x-2 px-4 py-2 bg-white hover:bg-zinc-200 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.12)] transition"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{t("wallet.goToTransfers")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Sub-navigation Tabs: Accounts & Categories vs Security & Backup */}
      <div className="flex items-center space-x-2 border-b border-zinc-800">
        <button
          onClick={() => setActiveSubTab("accounts")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition ${
            activeSubTab === "accounts"
              ? "border-white text-white font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>{t("wallet.tabs.accounts")}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-[2px] bg-zinc-900 text-zinc-400 border border-zinc-800">
            {accounts.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab("security")}
          className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-mono uppercase tracking-wider border-b-2 transition ${
            activeSubTab === "security"
              ? "border-white text-white font-bold"
              : "border-transparent text-zinc-500 hover:text-zinc-300"
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>{t("wallet.tabs.security")}</span>
        </button>
      </div>

      {/* TAB 1: Derived Accounts Organized by Categories */}
      {activeSubTab === "accounts" && (
        <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
          {/* Toolbar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {t("wallet.addressesAndCategories", { name: activeWallet.name })}
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">{t("wallet.categoriesDesc")}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("wallet.searchPlaceholder")}
                  className="bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] pl-8 pr-3 py-1.5 text-xs text-white font-mono outline-none w-56 transition"
                />
              </div>

              <button
                onClick={() => setShowAddCategory(!showAddCategory)}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 rounded-[2px] text-xs font-semibold transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-white" />
                <span>{t("wallet.newCategory")}</span>
              </button>

              <button
                onClick={handleDeriveAccount}
                disabled={loadingAccounts}
                className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.12)] transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t("wallet.addDerivedAddress")}</span>
              </button>
            </div>
          </div>

          {/* Create Category Form */}
          {showAddCategory && (
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-[2px] flex items-center space-x-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                placeholder={t("wallet.newCategoryPlaceholder")}
                className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-1.5 text-xs text-white outline-none"
                autoFocus
              />
              <button
                onClick={handleAddCategory}
                className="px-3 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-mono uppercase tracking-wider font-bold rounded-[2px] transition"
              >
                {t("common.create")}
              </button>
              <button
                onClick={() => setShowAddCategory(false)}
                className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}

          {/* Categories List with Drag and Drop */}
          <div className="space-y-4">
            {categories.map((cat, catIndex) => {
              const allCatAccounts = accounts.filter((a) => a.categoryId === cat.id);
              const catAccounts = normalizedQuery
                ? allCatAccounts.filter(
                    (a) =>
                      a.name.toLowerCase().includes(normalizedQuery) ||
                      a.address.toLowerCase().includes(normalizedQuery)
                  )
                : allCatAccounts;

              if (normalizedQuery && catAccounts.length === 0) {
                return null;
              }

              return (
                <div
                  key={cat.id}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    const dragType = e.dataTransfer.getData("type");
                    if (dragType === "category") {
                      handleCategoryDrop(e, catIndex);
                    } else {
                      handleAccountDropOnCategory(e, cat.id);
                    }
                  }}
                  className="bg-zinc-950/60 border border-zinc-800/90 rounded-[2px] overflow-hidden"
                >
                  {/* Category Header (Draggable) */}
                  <div
                    draggable
                    onDragStart={(e) => handleCategoryDragStart(e, catIndex)}
                    className="px-4 py-2.5 bg-zinc-900/70 border-b border-zinc-800/70 flex items-center justify-between cursor-move"
                  >
                    <div className="flex items-center space-x-2">
                      <GripVertical className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                      {editingCategory?.id === cat.id ? (
                        <div
                          className="flex items-center space-x-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            value={editingCategory.name}
                            onChange={(e) =>
                              setEditingCategory({ ...editingCategory, name: e.target.value })
                            }
                            className="bg-zinc-950 border border-white rounded-[2px] px-2 py-0.5 text-xs text-white outline-none font-bold"
                            autoFocus
                          />
                          <button
                            onClick={handleSaveCategoryName}
                            className="text-[10px] bg-white hover:bg-zinc-200 text-black font-bold px-2 py-0.5 rounded-[2px]"
                          >
                            {t("common.save")}
                          </button>
                          <button
                            onClick={() => setEditingCategory(null)}
                            className="text-[10px] text-zinc-400 hover:text-white"
                          >
                            {t("common.cancel")}
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-bold text-white tracking-wide">
                            {cat.name}
                          </span>
                          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-950 px-1.5 py-0.5 rounded-[2px] border border-zinc-800">
                            {catAccounts.length}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingCategory({ id: cat.id, name: cat.name });
                            }}
                            className="p-1 text-zinc-500 hover:text-zinc-200"
                            title={t("wallet.renameCategory")}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>

                    {categories.length > 1 && (
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-1 text-zinc-600 hover:text-rose-400 transition"
                        title={t("wallet.deleteCategoryTooltip")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Accounts inside this Category */}
                  <div className="p-3 space-y-2.5 min-h-[50px]">
                    {catAccounts.length === 0 ? (
                      <div className="p-4 text-center text-xs text-zinc-600 border border-dashed border-zinc-800/80 rounded-[2px]">
                        {t("wallet.dragAddressesHere")}
                      </div>
                    ) : (
                      catAccounts.map((acc) => {
                        const isActive = acc.address.toLowerCase() === unlockedAddress?.toLowerCase();
                        const isPrivKeyRevealed = !!revealedPrivKeys[acc.index];

                        return (
                          <div
                            key={acc.address}
                            draggable
                            onDragStart={(e) => handleAccountDragStart(e, acc.address)}
                            className={`p-3.5 rounded-[2px] border transition ${
                              isActive
                                ? "bg-white/[0.06] border-white/40 shadow-[0_0_15px_rgba(255,255,255,0.04)]"
                                : "bg-zinc-900/40 border-zinc-800/70 hover:border-zinc-700"
                            }`}
                          >
                            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                              {/* Drag handle & Account Details */}
                              <div className="flex items-start space-x-2.5 min-w-0">
                                <div className="cursor-move pt-1 text-zinc-600 hover:text-zinc-300">
                                  <GripVertical className="w-4 h-4" />
                                </div>
                                <VoxelAvatar seed={acc.address} size={32} className="border border-zinc-800 bg-zinc-950 p-0.5 mt-0.5" />

                                <div className="min-w-0 space-y-1">
                                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                    {editingAccountAddress === acc.address ? (
                                      <div className="flex items-center space-x-1.5">
                                        <input
                                          type="text"
                                          value={accountNameInput}
                                          onChange={(e) => setAccountNameInput(e.target.value)}
                                          className="bg-zinc-950 border border-white rounded-[2px] px-1.5 py-0.5 text-xs text-white outline-none"
                                          autoFocus
                                        />
                                        <button
                                          onClick={() => handleSaveAccountName(acc.address)}
                                          className="text-[10px] bg-white hover:bg-zinc-200 text-black font-bold px-1.5 py-0.5 rounded-[2px]"
                                        >
                                          {t("common.save")}
                                        </button>
                                        <button
                                          onClick={() => setEditingAccountAddress(null)}
                                          className="text-[10px] text-zinc-400 hover:text-white"
                                        >
                                          {t("common.cancel")}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center space-x-1.5">
                                        <span className="text-xs font-bold text-white">
                                          {acc.name}
                                        </span>
                                        <button
                                          onClick={() => {
                                            setEditingAccountAddress(acc.address);
                                            setAccountNameInput(acc.name);
                                          }}
                                          className="p-0.5 text-zinc-500 hover:text-zinc-200"
                                          title={t("wallet.renameAddress")}
                                        >
                                          <Pencil className="w-2.5 h-2.5" />
                                        </button>
                                      </div>
                                    )}

                                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded-[2px] border border-zinc-800">
                                      {acc.path}
                                    </span>

                                    {isActive ? (
                                      <span className="flex items-center space-x-1 text-[10px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full font-mono font-semibold">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>{t("common.active")}</span>
                                      </span>
                                    ) : (
                                      onSelectAddress && (
                                        <button
                                          onClick={() => onSelectAddress(acc.address)}
                                          className="text-[10px] text-zinc-400 hover:text-white bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 px-2 py-0.5 rounded-[2px] transition font-mono"
                                        >
                                          {t("wallet.useAsActive")}
                                        </button>
                                      )
                                    )}
                                  </div>

                                  <div className="flex items-center space-x-2">
                                    <span className="font-mono text-xs text-zinc-300 truncate select-all">
                                      {acc.address}
                                    </span>
                                    <button
                                      onClick={() => handleCopyAddress(acc.address)}
                                      className="p-1 hover:bg-zinc-800 rounded-[2px] text-zinc-400 hover:text-white transition shrink-0"
                                      title={t("wallet.copyAddress")}
                                    >
                                      {copiedAddress === acc.address ? (
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      ) : (
                                        <Copy className="w-3.5 h-3.5" />
                                      )}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              {/* Balance & Actions */}
                              <div className="flex items-center justify-between xl:justify-end space-x-4 shrink-0 pt-2 xl:pt-0 border-t xl:border-t-0 border-zinc-800/60">
                                <div className="xl:text-right">
                                  <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                                    {t("common.balance")}
                                  </div>
                                  <div className="text-sm font-bold font-mono text-white">
                                    {acc.balance}{" "}
                                    <span className="text-[10px] text-zinc-400">ROGUE</span>
                                  </div>
                                </div>

                                <div className="flex items-center space-x-1.5">
                                  {onNavigateToTransfers && (
                                    <button
                                      onClick={() => {
                                        if (!isActive && onSelectAddress) {
                                          onSelectAddress(acc.address);
                                        }
                                        onNavigateToTransfers();
                                      }}
                                      className="flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-white text-zinc-200 hover:text-black border border-zinc-700 hover:border-white text-[11px] font-mono font-semibold rounded-[2px] transition"
                                      title={t("wallet.goToTransfers")}
                                    >
                                      <Send className="w-3 h-3" />
                                      <span>{t("wallet.quickSend")}</span>
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleCopyPrivateKey(acc.index)}
                                    className="flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs rounded-[2px] transition"
                                    title={t("wallet.copyPrivKey")}
                                  >
                                    {copiedPrivKey === acc.index ? (
                                      <>
                                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-300 text-[11px] font-mono">
                                          {t("common.copied")}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <Key className="w-3.5 h-3.5" />
                                        <span className="text-[11px] font-mono">Key</span>
                                      </>
                                    )}
                                  </button>

                                  <button
                                    onClick={() => handleToggleRevealPrivateKey(acc.index)}
                                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white rounded-[2px] transition"
                                    title={
                                      isPrivKeyRevealed
                                        ? t("wallet.hidePrivKey")
                                        : t("wallet.revealPrivKey")
                                    }
                                  >
                                    {isPrivKeyRevealed ? (
                                      <EyeOff className="w-3.5 h-3.5" />
                                    ) : (
                                      <Eye className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Inline Revealed Private Key Drawer */}
                            {isPrivKeyRevealed && (
                              <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
                                <div className="flex items-center justify-between text-[11px] text-zinc-400">
                                  <span className="font-semibold text-white flex items-center space-x-1">
                                    <Key className="w-3 h-3 text-white" />
                                    <span>{t("wallet.privKeyTitle", { name: acc.name })}</span>
                                  </span>
                                  <span className="text-[10px] text-zinc-500">
                                    {t("wallet.hex64")}
                                  </span>
                                </div>

                                <div className="flex items-center space-x-2 p-2 bg-zinc-950 border border-rose-900/40 rounded-[2px]">
                                  <span className="font-mono text-xs text-zinc-200 break-all select-all flex-1">
                                    {revealedPrivKeys[acc.index]}
                                  </span>
                                  <button
                                    onClick={() => handleCopyPrivateKey(acc.index)}
                                    className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-[2px] transition shrink-0"
                                    title={t("wallet.copyPrivKey")}
                                  >
                                    {copiedPrivKey === acc.index ? (
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                    ) : (
                                      <Copy className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}

            {normalizedQuery &&
              accounts.filter(
                (a) =>
                  a.name.toLowerCase().includes(normalizedQuery) ||
                  a.address.toLowerCase().includes(normalizedQuery)
              ).length === 0 && (
                <div className="p-8 text-center text-xs font-mono text-zinc-500 border border-dashed border-zinc-800 rounded-[2px]">
                  {t("wallet.noMatchingAccounts", { query: searchQuery })}
                </div>
              )}
          </div>
        </div>
      )}

      {/* TAB 2: Security & Backup (BIP-39 Seed Phrase) */}
      {activeSubTab === "security" && (
        <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
            <div className="flex items-start space-x-3">
              <Key className="w-5 h-5 text-white mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  {t("wallet.seedTitle", { name: activeWallet.name })}
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">{t("wallet.seedSubtitle")}</p>
                <p className="text-[11px] text-zinc-500 mt-1">{t("wallet.securityTabDesc")}</p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleToggleMnemonic}
                disabled={loadingMnemonic}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium rounded-[2px] transition"
              >
                {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                <span>{showMnemonic ? t("wallet.hidePhrase") : t("wallet.revealPhrase")}</span>
              </button>

              <button
                onClick={handleCopyMnemonic}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 text-xs font-medium rounded-[2px] transition"
              >
                {copiedMnemonic ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-300">{t("common.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>{t("wallet.copyPhrase")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {showMnemonic ? (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
                {mnemonicWords.map((word, idx) => (
                  <div
                    key={idx}
                    className="flex items-center space-x-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-[2px] font-mono text-sm"
                  >
                    <span className="text-zinc-500 text-xs select-none w-5 text-right font-sans font-semibold">
                      {idx + 1}.
                    </span>
                    <span className="text-zinc-200 font-medium select-all">{word}</span>
                  </div>
                ))}
              </div>

              <div className="flex items-start space-x-2 p-3.5 bg-rose-950/20 border border-rose-800/40 rounded-[2px] text-xs text-zinc-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  <strong>{t("wallet.criticalSecurity")}</strong>{" "}
                  {t("wallet.securityNotice", { name: activeWallet.name })}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-5 bg-zinc-950/70 border border-zinc-800/80 rounded-[2px] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-zinc-400">
              <div className="flex items-center space-x-2 font-mono">
                <span className="tracking-widest text-zinc-600">
                  •••••••• •••••••• •••••••• ••••••••
                </span>
                <span className="text-zinc-500 text-[11px]">{t("wallet.phraseProtected")}</span>
              </div>
              <span className="text-zinc-500 text-[11px]">{t("wallet.clickToReveal")}</span>
            </div>
          )}
        </div>
      )}

      {/* Master Password Re-Auth Modal */}
      {secretPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
          <form
            onSubmit={handleConfirmSecretAuth}
            className="w-full max-w-sm bg-zinc-950 border border-white/20 rounded-[2px] p-5 space-y-4"
          >
            <div className="flex items-center space-x-2 text-white font-semibold text-sm">
              <Key className="w-4 h-4" />
              <span>{t("wallet.unlockModal.passwordLabel", "Master Password")}</span>
            </div>
            <input
              type="password"
              value={secretPassword}
              onChange={(e) => setSecretPassword(e.target.value)}
              placeholder="••••••••"
              autoFocus
              required
              className="w-full bg-black border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
            />
            {secretError && <div className="text-xs font-mono text-rose-400">{secretError}</div>}
            <div className="flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setSecretPrompt(null);
                  setSecretPassword("");
                  setSecretError(null);
                }}
                className="px-3 py-1.5 text-xs bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-[2px] border border-zinc-700"
              >
                {t("common.cancel", "Cancel")}
              </button>
              <button
                type="submit"
                disabled={verifyingSecret}
                className="px-3 py-1.5 text-xs bg-white text-black font-bold hover:bg-zinc-200 disabled:opacity-50 rounded-[2px]"
              >
                {verifyingSecret ? "..." : t("common.confirm", "Confirm")}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
