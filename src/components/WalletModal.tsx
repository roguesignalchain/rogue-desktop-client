import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Key, ShieldPlus, Lock, Copy, Check, AlertCircle, Download, Sparkles } from "lucide-react";
import { api } from "../services/api";
import { WalletSummary } from "../types";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletUnlocked: (activeWallet: WalletSummary, allWallets: WalletSummary[]) => void;
  initialMode?: "unlock" | "create" | "import";
  isVaultUnlocked?: boolean;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  onWalletUnlocked,
  initialMode = "unlock",
  isVaultUnlocked = false,
}) => {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"unlock" | "create" | "import">(initialMode);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [walletName, setWalletName] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [importMnemonicInput, setImportMnemonicInput] = useState("");
  const [wordCount, setWordCount] = useState<12 | 24>(12);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      if (isVaultUnlocked) {
        setMode(initialMode === "unlock" ? "create" : initialMode);
      } else {
        setMode(initialMode);
      }
    }
  }, [isOpen, initialMode, isVaultUnlocked]);

  if (!isOpen) return null;

  const handleGenerateMnemonic = async (words: 12 | 24 = wordCount) => {
    try {
      setLoading(true);
      const phrase = await api.generateMnemonic(words);
      setMnemonic(phrase);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : t("walletModal.errors.generateMnemonic"));
    } finally {
      setLoading(false);
    }
  };

  const handleCopyMnemonic = () => {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      setLoading(true);
      const wallets = await api.unlockWallet(password);
      if (wallets.length === 0) {
        throw new Error(t("walletModal.errors.noWalletsFound"));
      }
      onWalletUnlocked(wallets[0], wallets);
      setPassword("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const phrase = mode === "import" ? importMnemonicInput.trim().toLowerCase().replace(/\s+/g, " ") : mnemonic;
    const words = phrase ? phrase.split(/\s+/) : [];

    if (words.length !== 12 && words.length !== 24) {
      setError(t("walletModal.errors.wordsLength"));
      return;
    }

    if (!isVaultUnlocked) {
      if (password.length < 8) {
        setError(t("walletModal.errors.passwordMinLength"));
        return;
      }
      if (password !== confirmPassword) {
        setError(t("walletModal.errors.passwordMismatch"));
        return;
      }
    }

    try {
      setLoading(true);
      let activeWallet: WalletSummary;
      let allWallets: WalletSummary[];

      if (isVaultUnlocked) {
        // Vault is already unlocked, add new wallet to existing vault
        activeWallet = await api.addWallet(phrase, walletName.trim() || undefined);
        allWallets = await api.getWallets();
      } else {
        // Create initial vault
        activeWallet = await api.createWallet(phrase, password, walletName.trim() || undefined);
        allWallets = [activeWallet];
      }

      onWalletUnlocked(activeWallet, allWallets);
      setPassword("");
      setConfirmPassword("");
      setMnemonic("");
      setImportMnemonicInput("");
      setWalletName("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4">
      <div className="w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-[2px] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header & Tabs */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex space-x-1.5 overflow-x-auto">
            {!isVaultUnlocked && (
              <button
                onClick={() => {
                  setMode("unlock");
                  setError(null);
                }}
                className={`px-3 py-1.5 rounded-[2px] text-xs font-semibold transition ${
                  mode === "unlock"
                    ? "bg-white text-black font-bold border-white"
                    : "text-zinc-400 hover:text-white"
                }`}
              >
                {t("walletModal.unlockVault")}
              </button>
            )}

            <button
              onClick={() => {
                setMode("create");
                setError(null);
                if (!mnemonic) handleGenerateMnemonic(wordCount);
              }}
              className={`px-3 py-1.5 rounded-[2px] text-xs font-semibold transition ${
                mode === "create"
                  ? "bg-white text-black font-bold border-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {isVaultUnlocked ? t("walletModal.newWallet") : t("walletModal.createVault")}
            </button>

            <button
              onClick={() => {
                setMode("import");
                setError(null);
              }}
              className={`px-3 py-1.5 rounded-[2px] text-xs font-semibold transition ${
                mode === "import"
                  ? "bg-white text-black font-bold border-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t("walletModal.importMnemonic")}
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-white/5 border border-white/20 rounded-[2px] flex items-start space-x-2 text-xs font-mono text-zinc-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-white mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === "unlock" && (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-white">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t("walletModal.unlockTitle")}</h3>
                  <p className="text-xs text-zinc-400">{t("walletModal.unlockSubtitle")}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  {t("walletModal.masterPassword")}
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition pl-10 font-mono"
                    autoFocus
                    required
                  />
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)] transition flex items-center justify-center space-x-2"
              >
                <Key className="w-4 h-4" />
                <span>{loading ? t("walletModal.unlocking") : t("walletModal.unlockBtn")}</span>
              </button>
            </form>
          )}

          {mode === "create" && (
            <form onSubmit={handleCreateOrAdd} className="space-y-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-white">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isVaultUnlocked ? t("walletModal.createTitleNew") : t("walletModal.createTitleInit")}
                  </h3>
                  <p className="text-xs text-zinc-400">{t("walletModal.createSubtitle")}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  {t("walletModal.walletNameLabel")}
                </label>
                <input
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder={t("walletModal.walletNamePlaceholder")}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t("walletModal.seedLength")}
                  </label>
                  <div className="flex space-x-1 bg-zinc-900 p-0.5 rounded border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => {
                        setWordCount(12);
                        handleGenerateMnemonic(12);
                      }}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                        wordCount === 12 ? "bg-white text-black font-bold" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {t("walletModal.words12")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setWordCount(24);
                        handleGenerateMnemonic(24);
                      }}
                      className={`px-2 py-0.5 text-[10px] font-mono rounded ${
                        wordCount === 24 ? "bg-white text-black font-bold" : "text-zinc-400 hover:text-white"
                      }`}
                    >
                      {t("walletModal.words24")}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-zinc-900 border border-zinc-800 rounded-[2px] space-y-2">
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 font-mono text-xs">
                    {mnemonic.split(" ").map((w, idx) => (
                      <div key={idx} className="bg-zinc-950 px-2 py-1 rounded border border-zinc-800/80 text-white font-mono">
                        <span className="text-zinc-600 mr-1 select-none">{idx + 1}.</span>
                        <span>{w}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-zinc-800 text-xs">
                    <button
                      type="button"
                      onClick={() => handleGenerateMnemonic(wordCount)}
                      className="text-zinc-400 hover:text-white transition"
                    >
                      {t("walletModal.regeneratePhrase")}
                    </button>
                    <button
                      type="button"
                      onClick={handleCopyMnemonic}
                      className="flex items-center space-x-1 text-white hover:text-zinc-300 transition"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? t("common.copied") : t("walletModal.copyPhrase")}</span>
                    </button>
                  </div>
                </div>
              </div>

              {!isVaultUnlocked && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      {t("walletModal.passwordMin8")}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      {t("walletModal.confirmPassword")}
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition font-mono"
                      required
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading || !mnemonic}
                className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)] transition flex items-center justify-center space-x-2"
              >
                <ShieldPlus className="w-4 h-4" />
                <span>
                  {loading
                    ? t("walletModal.creating")
                    : isVaultUnlocked
                    ? t("walletModal.saveToVault")
                    : t("walletModal.createAndSave")}
                </span>
              </button>
            </form>
          )}

          {mode === "import" && (
            <form onSubmit={handleCreateOrAdd} className="space-y-4">
              <div className="flex items-center space-x-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-white">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">{t("walletModal.importTitle")}</h3>
                  <p className="text-xs text-zinc-400">{t("walletModal.importSubtitle")}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  {t("walletModal.walletNameLabel")}
                </label>
                <input
                  type="text"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  placeholder={t("walletModal.importNamePlaceholder")}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    {t("walletModal.mnemonicLabel")}
                  </label>
                  <span className="text-[11px] font-mono text-zinc-500">
                    {t("walletModal.wordsCount", {
                      count: importMnemonicInput.trim() ? importMnemonicInput.trim().split(/\s+/).length : 0,
                    })}
                  </span>
                </div>
                <textarea
                  value={importMnemonicInput}
                  onChange={(e) => setImportMnemonicInput(e.target.value)}
                  placeholder={t("walletModal.mnemonicPlaceholder")}
                  rows={3}
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] p-3 text-xs text-white font-mono outline-none transition resize-none leading-relaxed"
                  required
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  {t("walletModal.mnemonicHint")}
                </p>
              </div>

              {!isVaultUnlocked && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      {t("walletModal.passwordMin8")}
                    </label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                      {t("walletModal.confirmPassword")}
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full bg-zinc-900 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-sm text-white outline-none transition font-mono"
                      required
                    />
                  </div>
                </>
              )}

              <button
                type="submit"
                disabled={loading || !importMnemonicInput.trim()}
                className="w-full py-2.5 bg-white hover:bg-zinc-200 disabled:opacity-40 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)] transition flex items-center justify-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>
                  {loading
                    ? t("walletModal.importing")
                    : isVaultUnlocked
                    ? t("walletModal.importToVault")
                    : t("walletModal.createWithMnemonic")}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
