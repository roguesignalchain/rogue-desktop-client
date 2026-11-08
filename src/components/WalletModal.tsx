import React, { useState } from "react";
import { X, Key, ShieldPlus, Lock, Copy, Check, AlertCircle } from "lucide-react";
import { api } from "../services/api";

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onWalletUnlocked: (address: string) => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({ isOpen, onClose, onWalletUnlocked }) => {
  const [mode, setMode] = useState<"unlock" | "create">("unlock");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleGenerateMnemonic = async () => {
    try {
      const phrase = await api.generateMnemonic();
      setMnemonic(phrase);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate mnemonic");
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
      const address = await api.unlockWallet(password);
      onWalletUnlocked(address);
      setPassword("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mnemonic) {
      setError("Please generate a 12-word seed phrase first.");
      return;
    }
    if (password.length < 8) {
      setError("Master password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      const address = await api.createWallet(mnemonic, password);
      onWalletUnlocked(address);
      setPassword("");
      setConfirmPassword("");
      setMnemonic("");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex space-x-2">
            <button
              onClick={() => {
                setMode("unlock");
                setError(null);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "unlock"
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Unlock Vault
            </button>
            <button
              onClick={() => {
                setMode("create");
                setError(null);
                if (!mnemonic) handleGenerateMnemonic();
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                mode === "create"
                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              Create New Wallet
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1 text-zinc-500 hover:text-white rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-rose-950/40 border border-rose-800/80 rounded-lg flex items-center space-x-2 text-xs text-rose-300 font-mono">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {mode === "unlock" ? (
            <form onSubmit={handleUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Master Vault Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-lg pl-9 pr-3 py-2 text-xs text-white outline-none font-mono"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition"
              >
                <Key className="w-3.5 h-3.5" />
                <span>{loading ? "Decrypting..." : "Unlock Vault"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    BIP-39 Mnemonic Phrase (12 Words)
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyMnemonic}
                    className="flex items-center space-x-1 text-[11px] text-zinc-400 hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1.5 p-3 bg-zinc-900 border border-zinc-800 rounded-lg text-center font-mono text-xs">
                  {mnemonic.split(" ").map((w, i) => (
                    <div key={i} className="p-1 rounded bg-zinc-950/80 text-zinc-300">
                      <span className="text-zinc-600 mr-1">{i + 1}.</span>
                      {w}
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Master Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters..."
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat password..."
                  className="w-full bg-zinc-900 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs text-white outline-none font-mono"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center space-x-2 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition"
              >
                <ShieldPlus className="w-3.5 h-3.5" />
                <span>{loading ? "Encrypting & Deriving..." : "Create & Encrypt Wallet"}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

