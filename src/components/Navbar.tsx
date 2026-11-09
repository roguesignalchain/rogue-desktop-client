import React, { useState, useRef, useEffect } from "react";
import {
  Activity,
  ShieldAlert,
  Radio,
  RefreshCw,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Wallet,
  Plus,
  Download,
  Lock,
  Trash2,
  Check,
} from "lucide-react";
import { NodeStatus, SyncStatus, WalletSummary, AccountInfo } from "../types";

interface NavbarProps {
  nodeStatus: NodeStatus;
  syncStatus: SyncStatus;
  rpcConnected: boolean;
  peerCount: number;
  currentBlock: number;
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  allWallets: WalletSummary[];
  derivedAccounts: AccountInfo[];
  activeBalance: string;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onLockWallet: () => void;
  onSelectWallet: (walletId: string) => void;
  onSelectAddress: (address: string) => void;
  onRemoveWallet: (walletId: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  nodeStatus,
  syncStatus,
  rpcConnected,
  peerCount,
  currentBlock,
  unlockedAddress,
  activeWallet,
  allWallets,
  derivedAccounts,
  activeBalance,
  onOpenWalletModal,
  onLockWallet,
  onSelectWallet,
  onSelectAddress,
  onRemoveWallet,
}) => {
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

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950 px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Network info */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <img src="/icon.png" alt="Rogue Signal" className="w-6 h-6 rounded object-contain shadow-sm" />
          <span className="font-black text-lg tracking-wider bg-gradient-to-r from-rose-500 to-amber-400 bg-clip-text text-transparent">
            ROGUE SIGNAL
          </span>
        </div>
        <div className="text-xs px-2.5 py-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center space-x-1.5 font-mono">
          <Radio className="w-3.5 h-3.5 text-rose-400" />
          <span>Chain ID: 800055</span>
        </div>
      </div>

      {/* Dynamic Sync Status & Block tracker */}
      <div className="flex items-center space-x-4">
        {/* Dynamic Network / Sync Badge */}
        {!rpcConnected && !nodeStatus.running ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-red-950/30 border border-red-900/40 rounded-full text-xs font-mono text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>Nodo Offline</span>
          </div>
        ) : !rpcConnected ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-950/30 border border-cyan-800/40 rounded-full text-xs font-mono text-cyan-300">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>Conectando RPC...</span>
          </div>
        ) : peerCount === 0 ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/30 border border-amber-900/40 rounded-full text-xs font-mono text-amber-300">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span>Conectando Pares...</span>
          </div>
        ) : syncStatus.isSyncing ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-cyan-950/30 border border-cyan-800/40 rounded-full text-xs font-mono text-cyan-300">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>{syncStatus.peersAhead ? "Verificando..." : `Syncing ${syncStatus.progressPercentage}%`}</span>
          </div>
        ) : currentBlock === 0 ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-amber-950/30 border border-amber-800/40 rounded-full text-xs font-mono text-amber-300">
            <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
            <span>Iniciando Cadena #0</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-emerald-950/40 border border-emerald-800/50 rounded-full text-xs font-mono text-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sincronizado</span>
          </div>
        )}

        <div className="flex items-center space-x-2 text-xs font-mono">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-zinc-400">Bloque:</span>
          <span className="text-cyan-400 font-bold">#{currentBlock}</span>
        </div>

        {/* Multi-Wallet Dropdown Selector */}
        {unlockedAddress ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 hover:border-zinc-600 rounded-lg text-xs transition"
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#34d399]" />
              <div className="flex flex-col items-start leading-tight">
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-white truncate max-w-[120px]">
                    {activeWallet?.name || "Billetera"}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    ({unlockedAddress.slice(0, 6)}...{unlockedAddress.slice(-4)})
                  </span>
                </div>
                <span className="font-mono text-[10px] text-amber-400 font-bold mt-0.5">
                  {activeBalance} ROGUE
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-100">
                <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/60">
                  <div className="flex items-center space-x-1.5">
                    <Wallet className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">Billeteras Registradas</span>
                  </div>
                  <span className="text-[10px] bg-zinc-800 text-zinc-400 px-1.5 py-0.5 rounded font-mono">
                    {allWallets.length} {allWallets.length === 1 ? "billetera" : "billeteras"}
                  </span>
                </div>

                {/* Wallets & Derived Accounts List */}
                <div className="max-h-72 overflow-y-auto p-2 space-y-1.5">
                  {allWallets.map((w) => {
                    const isWalletActive = activeWallet?.id === w.id;
                    const isExpanded = expandedWalletId === w.id;

                    return (
                      <div
                        key={w.id}
                        className={`rounded-lg border transition ${
                          isWalletActive
                            ? "bg-rose-950/15 border-rose-500/30"
                            : "bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700"
                        }`}
                      >
                        {/* Wallet Row Header */}
                        <div className="p-2.5 flex items-center justify-between">
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
                              className="p-0.5 text-zinc-500 hover:text-zinc-200"
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
                                  <span className="text-[9px] bg-rose-950 text-rose-300 border border-rose-800/60 px-1 rounded font-mono">
                                    Activa
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-zinc-500 block truncate">
                                {w.primary_address}
                              </span>
                            </div>
                          </div>

                          {/* Delete button (if more than 1 wallet) */}
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
                              className={`p-1.5 rounded transition ml-1.5 ${
                                walletToDelete === w.id
                                  ? "bg-rose-600 text-white"
                                  : "text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                              }`}
                              title={walletToDelete === w.id ? "Clic para confirmar eliminación" : "Eliminar billetera"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Collapsible Derived Accounts of this Wallet */}
                        {isExpanded && isWalletActive && derivedAccounts.length > 0 && (
                          <div className="px-3 pb-2.5 pt-1 space-y-1 border-t border-zinc-800/60 bg-zinc-950/40">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                              Cuentas Derivadas ({derivedAccounts.length})
                            </span>
                            {derivedAccounts.map((acc) => {
                              const isAccountActive = acc.address.toLowerCase() === unlockedAddress?.toLowerCase();
                              return (
                                <div
                                  key={acc.address}
                                  onClick={() => {
                                    onSelectAddress(acc.address);
                                    setDropdownOpen(false);
                                  }}
                                  className={`flex items-center justify-between p-1.5 rounded text-xs font-mono cursor-pointer transition ${
                                    isAccountActive
                                      ? "bg-rose-500/10 text-rose-300 border border-rose-500/30"
                                      : "text-zinc-400 hover:text-white hover:bg-zinc-800/60"
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <span className="text-zinc-500 text-[10px]">#{acc.index + 1}</span>
                                    <span className="truncate">{acc.name || `${acc.address.slice(0, 6)}...${acc.address.slice(-4)}`}</span>
                                  </div>
                                  {isAccountActive && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
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
                <div className="p-2 border-t border-zinc-800 bg-zinc-900/40 space-y-1">
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenWalletModal("create");
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                  >
                    <Plus className="w-3.5 h-3.5 text-rose-400" />
                    <span>Crear Nueva Billetera</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenWalletModal("import");
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-zinc-300 hover:text-white hover:bg-zinc-800 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Importar Mnemónico Existente</span>
                  </button>

                  <div className="border-t border-zinc-800 my-1" />

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onLockWallet();
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 transition"
                  >
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    <span>Bloquear Bóveda</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center space-x-2">
            <button
              onClick={() => onOpenWalletModal("unlock")}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/60 rounded-lg text-xs text-zinc-300 transition"
            >
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>Desbloquear Billetera</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
