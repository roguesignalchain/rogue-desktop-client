import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { api } from "../services/api";
import { AccountInfo, WalletSummary, WalletCategory } from "../types";

export interface AccountWithMeta extends AccountInfo {
  balance: string;
  name: string;
  categoryId: string;
  order: number;
}

interface WalletViewProps {
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  balance: string;
  rpcUrl: string;
  onRefreshBalance: () => void;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onSelectAddress?: (address: string) => void;
  onWalletRenamed?: (walletId: string, newName: string) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  unlockedAddress,
  activeWallet,
  balance,
  rpcUrl,
  onRefreshBalance,
  onOpenWalletModal,
  onSelectAddress,
  onWalletRenamed,
}) => {
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

  // Transfer Form State
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasTier, setGasTier] = useState<"slow" | "normal" | "fast">("normal");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Drag and Drop State
  const [draggedCategoryIndex, setDraggedCategoryIndex] = useState<number | null>(null);
  const [draggedAccountAddress, setDraggedAccountAddress] = useState<string | null>(null);

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
    if (savedCats) {
      try {
        currentCats = JSON.parse(savedCats);
      } catch {
        currentCats = [{ id: "cat_default", name: "General", order: 0 }];
      }
    } else {
      currentCats = [{ id: "cat_default", name: "General", order: 0 }];
      localStorage.setItem(catKey, JSON.stringify(currentCats));
    }
    setCategories(currentCats);

    loadAccounts(activeWallet.id, currentCats);
  }, [activeWallet?.id, rpcUrl]);

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
            name: acc.index === 0 ? "Cuenta Principal" : `Cuenta #${acc.index + 1}`,
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
  };

  // Save Categories
  const saveCategories = (updatedCats: WalletCategory[]) => {
    if (!activeWallet) return;
    setCategories(updatedCats);
    localStorage.setItem(`rogue_categories_${activeWallet.id}`, JSON.stringify(updatedCats));
  };

  // Handle Mnemonic
  const handleToggleMnemonic = async () => {
    if (showMnemonic) {
      setShowMnemonic(false);
      return;
    }
    if (!mnemonic && activeWallet) {
      try {
        setLoadingMnemonic(true);
        const phrase = await api.getMnemonic(activeWallet.id);
        setMnemonic(phrase);
      } catch (err) {
        console.warn("Failed to get mnemonic:", err);
      } finally {
        setLoadingMnemonic(false);
      }
    }
    setShowMnemonic(true);
  };

  const handleCopyMnemonic = async () => {
    try {
      let phrase = mnemonic;
      if (!phrase && activeWallet) {
        phrase = await api.getMnemonic(activeWallet.id);
        setMnemonic(phrase);
      }
      await navigator.clipboard.writeText(phrase);
      setCopiedMnemonic(true);
      setTimeout(() => setCopiedMnemonic(false), 2000);
    } catch (err) {
      console.warn("Failed to copy mnemonic:", err);
    }
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
            name: `Cuenta #${acc.index + 1}`,
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
    try {
      const privKey = await api.getPrivateKey(index, activeWallet.id);
      await navigator.clipboard.writeText(privKey);
      setCopiedPrivKey(index);
      setTimeout(() => setCopiedPrivKey(null), 2500);
    } catch (err) {
      console.error("Failed to copy private key:", err);
    }
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
      try {
        const privKey = await api.getPrivateKey(index, activeWallet.id);
        setRevealedPrivKeys((prev) => ({ ...prev, [index]: privKey }));
      } catch (err) {
        console.error("Failed to reveal private key:", err);
      }
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
    const updated = categories.map((c) => (c.id === editingCategory.id ? { ...c, name: editingCategory.name.trim() } : c));
    saveCategories(updated);
    setEditingCategory(null);
  };

  const handleDeleteCategory = (catId: string) => {
    if (categories.length <= 1) return;
    const remainingCats = categories.filter((c) => c.id !== catId);
    const fallbackCatId = remainingCats[0].id;
    const updatedAccounts = accounts.map((a) => (a.categoryId === catId ? { ...a, categoryId: fallbackCatId } : a));
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

  // Send Transfer
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockedAddress) {
      setStatusMsg({ type: "error", text: "Por favor desbloquea la billetera primero." });
      return;
    }
    if (!recipient.startsWith("0x") || recipient.length !== 42) {
      setStatusMsg({ type: "error", text: "Dirección de destino inválida (debe iniciar con 0x y tener 42 caracteres)." });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setStatusMsg({ type: "error", text: "Ingresa un monto válido de ROGUE." });
      return;
    }

    try {
      setSending(true);
      setStatusMsg({ type: "info", text: "Estimando gas y enviando transacción a la red..." });

      const wei = BigInt(Math.floor(parsedAmount * 1e6)) * BigInt(10 ** 12);
      const valueHex = "0x" + wei.toString(16);

      const gasPriceGwei = gasTier === "slow" ? 1 : gasTier === "normal" ? 2 : 5;
      const gasPriceHex = "0x" + (BigInt(gasPriceGwei) * BigInt(10 ** 9)).toString(16);

      const txParams = {
        from: unlockedAddress,
        to: recipient,
        value: valueHex,
        gas: "0x5208",
        gasPrice: gasPriceHex,
      };

      const txHash = await api.callRpc<string>(rpcUrl, "eth_sendTransaction", [txParams]);
      setStatusMsg({
        type: "success",
        text: `¡Transacción transmitida exitosamente! TxHash: ${txHash}`,
      });
      setRecipient("");
      setAmount("");
      onRefreshBalance();
      if (activeWallet) loadAccounts(activeWallet.id, categories);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ type: "error", text: `Error al enviar transacción: ${msg}` });
    } finally {
      setSending(false);
    }
  };

  if (!unlockedAddress || !activeWallet) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Billetera Bloqueada o No Inicializada</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Tu billetera determinista BIP-39 está cifrada de forma segura con Argon2id y AES-256-GCM. Desbloquea tu bóveda o crea una nueva para enviar y recibir ROGUE.
        </p>
        <button
          onClick={() => onOpenWalletModal("unlock")}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition shadow-md"
        >
          Desbloquear / Inicializar Bóveda
        </button>
      </div>
    );
  }

  const mnemonicWords = mnemonic ? mnemonic.trim().split(/\s+/) : [];

  return (
    <div className="space-y-6">
      {/* Active Wallet & Active Account Banner */}
      <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              {editingWalletName ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={walletNameInput}
                    onChange={(e) => setWalletNameInput(e.target.value)}
                    className="bg-zinc-950 border border-rose-500 rounded px-2 py-0.5 text-sm font-bold text-white outline-none"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveWalletName}
                    className="text-xs bg-rose-600 px-2 py-0.5 rounded text-white font-semibold"
                  >
                    Guardar
                  </button>
                  <button
                    onClick={() => setEditingWalletName(false)}
                    className="text-xs text-zinc-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-black text-white">{activeWallet.name}</h1>
                  <button
                    onClick={() => setEditingWalletName(true)}
                    className="p-1 text-zinc-500 hover:text-zinc-200"
                    title="Renombrar billetera"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/60 font-mono">
                Billetera Activa
              </span>
            </div>

            <div className="flex items-center space-x-2 font-mono text-sm text-white pt-1">
              <span className="text-zinc-400 text-xs font-sans font-semibold">Dirección seleccionada:</span>
              <span className="bg-zinc-950 px-2.5 py-1 rounded-lg border border-zinc-800 text-xs">
                {unlockedAddress}
              </span>
              <button
                onClick={() => handleCopyAddress(unlockedAddress)}
                className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition"
                title="Copiar dirección activa"
              >
                {copiedAddress === unlockedAddress ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono">
              BIP-44 Estándar EVM • Toda la minería y envíos operan sobre la dirección seleccionada
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Saldo de la Dirección</span>
            <div className="text-3xl font-black text-amber-400 font-mono mt-1">
              {balance} <span className="text-sm font-bold text-zinc-400">ROGUE</span>
            </div>
          </div>
        </div>
      </div>

      {/* BIP-39 Seed Phrase Section for this Mnemonic */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <Key className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Frase Semilla Mnemónica de "{activeWallet.name}"
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                BIP-39 determinista para restaurar esta billetera y todas sus cuentas derivadas
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleMnemonic}
              disabled={loadingMnemonic}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
            >
              {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showMnemonic ? "Ocultar Frase" : "Ver Frase Semilla"}</span>
            </button>

            <button
              onClick={handleCopyMnemonic}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
            >
              {copiedMnemonic ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400">¡Copiada!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Frase</span>
                </>
              )}
            </button>
          </div>
        </div>

        {showMnemonic ? (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
              {mnemonicWords.map((word, idx) => (
                <div
                  key={idx}
                  className="flex items-center space-x-2 p-2.5 bg-zinc-950 border border-zinc-800 rounded-lg font-mono text-sm"
                >
                  <span className="text-zinc-500 text-xs select-none w-5 text-right font-sans font-semibold">
                    {idx + 1}.
                  </span>
                  <span className="text-amber-300 font-medium select-all">{word}</span>
                </div>
              ))}
            </div>

            <div className="flex items-start space-x-2 p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-xs text-amber-300">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <span>
                <strong>Seguridad Crítica:</strong> Mantén esta frase mnemónica en secreto. Da control irrestricto sobre todas las direcciones derivadas de {activeWallet.name}.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center space-x-2 font-mono">
              <span className="tracking-widest text-zinc-600">•••••••• •••••••• •••••••• ••••••••</span>
              <span className="text-zinc-500 text-[11px]">(Frase protegida)</span>
            </div>
            <span className="text-zinc-500 text-[11px]">Haz clic en "Ver Frase Semilla" para revelarla</span>
          </div>
        )}
      </div>

      {/* Derived Accounts Organized by Categories with Drag and Drop */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Direcciones y Categorías ({activeWallet.name})
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {accounts.length} {accounts.length === 1 ? "cuenta" : "cuentas"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Organiza tus direcciones arrastrando entre categorías. Asigna nombres y propósitos personalizados.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowAddCategory(!showAddCategory)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition"
            >
              <FolderPlus className="w-4 h-4 text-cyan-400" />
              <span>Nueva Categoría</span>
            </button>

            <button
              onClick={handleDeriveAccount}
              disabled={loadingAccounts}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Agregar Dirección Derivada</span>
            </button>
          </div>
        </div>

        {/* Create Category Form */}
        {showAddCategory && (
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-lg flex items-center space-x-2 animate-in fade-in duration-100">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nombre de la nueva categoría (ej. Pagos, Staking, Vaults)..."
              className="flex-1 bg-zinc-900 border border-zinc-800 focus:border-cyan-500 rounded px-3 py-1.5 text-xs text-white outline-none"
              autoFocus
            />
            <button
              onClick={handleAddCategory}
              className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded transition"
            >
              Crear
            </button>
            <button
              onClick={() => setShowAddCategory(false)}
              className="px-2 py-1.5 text-zinc-400 hover:text-white text-xs"
            >
              Cancelar
            </button>
          </div>
        )}

        {/* Categories List with Drag and Drop */}
        <div className="space-y-4">
          {categories.map((cat, catIndex) => {
            const catAccounts = accounts.filter((a) => a.categoryId === cat.id);

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
                className="bg-zinc-950/60 border border-zinc-800/90 rounded-xl overflow-hidden"
              >
                {/* Category Header (Draggable) */}
                <div
                  draggable
                  onDragStart={(e) => handleCategoryDragStart(e, catIndex)}
                  className="px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/70 flex items-center justify-between cursor-move"
                >
                  <div className="flex items-center space-x-2">
                    <GripVertical className="w-4 h-4 text-zinc-600 hover:text-zinc-400" />
                    {editingCategory?.id === cat.id ? (
                      <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editingCategory.name}
                          onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                          className="bg-zinc-950 border border-cyan-500 rounded px-2 py-0.5 text-xs text-white outline-none font-bold"
                          autoFocus
                        />
                        <button
                          onClick={handleSaveCategoryName}
                          className="text-[10px] bg-cyan-600 text-white px-2 py-0.5 rounded font-semibold"
                        >
                          Guardar
                        </button>
                        <button
                          onClick={() => setEditingCategory(null)}
                          className="text-[10px] text-zinc-400 hover:text-white"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-white tracking-wide">{cat.name}</span>
                        <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded">
                          {catAccounts.length}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingCategory({ id: cat.id, name: cat.name });
                          }}
                          className="p-1 text-zinc-500 hover:text-zinc-200"
                          title="Renombrar categoría"
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
                      title="Eliminar categoría (las cuentas se moverán a la categoría principal)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Accounts inside this Category */}
                <div className="p-3 space-y-2.5 min-h-[50px]">
                  {catAccounts.length === 0 ? (
                    <div className="p-4 text-center text-xs text-zinc-600 border border-dashed border-zinc-800/80 rounded-lg">
                      Arrastra direcciones aquí para organizarlas en esta categoría.
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
                          className={`p-3.5 rounded-lg border transition ${
                            isActive
                              ? "bg-rose-950/15 border-rose-500/40 shadow-sm"
                              : "bg-zinc-900/40 border-zinc-800/70 hover:border-zinc-700"
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            {/* Drag handle & Account Details */}
                            <div className="flex items-start space-x-2.5 min-w-0">
                              <div className="cursor-move pt-1 text-zinc-600 hover:text-zinc-300">
                                <GripVertical className="w-4 h-4" />
                              </div>

                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                                  {editingAccountAddress === acc.address ? (
                                    <div className="flex items-center space-x-1.5">
                                      <input
                                        type="text"
                                        value={accountNameInput}
                                        onChange={(e) => setAccountNameInput(e.target.value)}
                                        className="bg-zinc-950 border border-rose-500 rounded px-1.5 py-0.5 text-xs text-white outline-none"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveAccountName(acc.address)}
                                        className="text-[10px] bg-rose-600 text-white px-1.5 py-0.5 rounded font-semibold"
                                      >
                                        Guardar
                                      </button>
                                      <button
                                        onClick={() => setEditingAccountAddress(null)}
                                        className="text-[10px] text-zinc-400 hover:text-white"
                                      >
                                        Cancelar
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center space-x-1.5">
                                      <span className="text-xs font-bold text-white">{acc.name}</span>
                                      <button
                                        onClick={() => {
                                          setEditingAccountAddress(acc.address);
                                          setAccountNameInput(acc.name);
                                        }}
                                        className="p-0.5 text-zinc-500 hover:text-zinc-200"
                                        title="Renombrar dirección"
                                      >
                                        <Pencil className="w-2.5 h-2.5" />
                                      </button>
                                    </div>
                                  )}

                                  <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1 rounded border border-zinc-800">
                                    {acc.path}
                                  </span>

                                  {isActive ? (
                                    <span className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-1.5 py-0.5 rounded-full font-mono font-semibold">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span>Activa</span>
                                    </span>
                                  ) : (
                                    onSelectAddress && (
                                      <button
                                        onClick={() => onSelectAddress(acc.address)}
                                        className="text-[10px] text-zinc-400 hover:text-white bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-2 py-0.5 rounded transition"
                                      >
                                        Usar como Activa
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
                                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition shrink-0"
                                    title="Copiar dirección"
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

                            {/* Balance & Private Key actions */}
                            <div className="flex items-center justify-between lg:justify-end space-x-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/60">
                              <div className="text-right">
                                <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Saldo</div>
                                <div className="text-sm font-bold font-mono text-amber-400">
                                  {acc.balance} <span className="text-[10px] text-zinc-400">ROGUE</span>
                                </div>
                              </div>

                              <div className="flex items-center space-x-1.5">
                                <button
                                  onClick={() => handleCopyPrivateKey(acc.index)}
                                  className="flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
                                  title="Copiar llave privada"
                                >
                                  {copiedPrivKey === acc.index ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      <span className="text-emerald-400 text-[11px]">¡Copiada!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Key className="w-3.5 h-3.5 text-rose-400" />
                                      <span className="text-[11px]">Copiar PrivKey</span>
                                    </>
                                  )}
                                </button>

                                <button
                                  onClick={() => handleToggleRevealPrivateKey(acc.index)}
                                  className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition"
                                  title={isPrivKeyRevealed ? "Ocultar llave privada" : "Ver llave privada"}
                                >
                                  {isPrivKeyRevealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Inline Revealed Private Key Drawer */}
                          {isPrivKeyRevealed && (
                            <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2 animate-in fade-in duration-150">
                              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                                <span className="font-semibold text-rose-400 flex items-center space-x-1">
                                  <Key className="w-3 h-3 text-rose-400" />
                                  <span>Llave Privada (ECDSA secp256k1) de {acc.name}</span>
                                </span>
                                <span className="text-[10px] text-zinc-500">Hexadecimal 64 caracteres</span>
                              </div>

                              <div className="flex items-center space-x-2 p-2 bg-zinc-900 border border-rose-900/40 rounded-lg">
                                <span className="font-mono text-xs text-rose-300 break-all select-all flex-1">
                                  {revealedPrivKeys[acc.index]}
                                </span>
                                <button
                                  onClick={() => handleCopyPrivateKey(acc.index)}
                                  className="p-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded transition shrink-0"
                                  title="Copiar llave privada"
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
        </div>
      </div>

      {/* Send Transfer Card */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl">
        <div className="flex items-center space-x-2 pb-4 border-b border-zinc-800">
          <Send className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Transferir ROGUE (EIP-1559)</h2>
        </div>

        <form onSubmit={handleSend} className="mt-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Dirección de Destino
            </label>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x..."
              className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3.5 py-2 text-sm text-white font-mono outline-none transition"
              required
            />
          </div>

          <div>
            <div className="flex justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              <span>Monto a Transferir (ROGUE)</span>
              <span>Disponible: {balance} ROGUE</span>
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3.5 py-2 text-sm text-white font-mono outline-none transition pr-20"
                required
              />
              <button
                type="button"
                onClick={() => setAmount(balance)}
                className="absolute right-2 top-1.5 px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 rounded font-mono transition"
              >
                Max
              </button>
            </div>
          </div>

          {/* EIP-1559 Gas Presets */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
              Velocidad de Red / Tarifa de Prioridad (EIP-1559)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { id: "slow", label: "Lento", fee: "1 Gwei", time: "~20s" },
                  { id: "normal", label: "Normal", fee: "2 Gwei", time: "~10s" },
                  { id: "fast", label: "Rápido", fee: "5 Gwei", time: "<10s" },
                ] as const
              ).map((tier) => (
                <div
                  key={tier.id}
                  onClick={() => setGasTier(tier.id)}
                  className={`p-3 rounded-lg border text-center cursor-pointer transition ${
                    gasTier === tier.id
                      ? "bg-rose-500/10 border-rose-500 text-rose-300"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                  }`}
                >
                  <div className="text-xs font-bold">{tier.label}</div>
                  <div className="text-[11px] font-mono mt-0.5">{tier.fee}</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">{tier.time}</div>
                </div>
              ))}
            </div>
          </div>

          {statusMsg && (
            <div
              className={`p-3 rounded-lg text-xs font-mono border ${
                statusMsg.type === "success"
                  ? "bg-emerald-950/40 border-emerald-800 text-emerald-300"
                  : statusMsg.type === "error"
                  ? "bg-rose-950/40 border-rose-800 text-rose-300"
                  : "bg-zinc-900 border-zinc-700 text-zinc-300"
              }`}
            >
              {statusMsg.text}
            </div>
          )}

          <button
            type="submit"
            disabled={sending}
            className="w-full flex items-center justify-center space-x-2 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-md transition"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? "Transmitiendo Transacción..." : "Enviar ROGUE"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
