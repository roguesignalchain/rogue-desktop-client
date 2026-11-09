import React, { useState, useRef, useEffect } from "react";
import {
  Activity,
  ShieldAlert,
  Radio,
  RefreshCw,
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
    <header className="h-14 border-b border-white/10 bg-black px-6 flex items-center justify-between sticky top-0 z-30 select-none">
      {/* Brand & Network info */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2.5">
          <div className="w-7 h-7 rounded-[2px] bg-black border border-white/20 p-0.5 flex items-center justify-center">
            <img src="/icon.png" alt="Rogue Signal" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-base tracking-wider text-white font-display">
            ROGUE SIGNAL
          </span>
        </div>
        <div className="text-xs px-2.5 py-0.5 rounded-[2px] bg-[#0A0A0C] border border-white/15 text-zinc-300 flex items-center space-x-1.5 font-mono">
          <Radio className="w-3.5 h-3.5 text-white" />
          <span>[CHAIN ID: 800055]</span>
        </div>
      </div>

      {/* Dynamic Sync Status & Block tracker */}
      <div className="flex items-center space-x-4">
        {/* Dynamic Network / Sync Badge */}
        {!rpcConnected && !nodeStatus.running ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-black border border-white/10 rounded-[2px] text-xs font-mono text-zinc-500">
            <span className="w-2 h-2 rounded-full bg-zinc-600" />
            <span>[NODO OFFLINE]</span>
          </div>
        ) : !rpcConnected ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-zinc-950 border border-white/20 rounded-[2px] text-xs font-mono text-zinc-300">
            <RefreshCw className="w-3 h-3 text-white animate-spin" />
            <span>[CONECTANDO RPC...]</span>
          </div>
        ) : peerCount === 0 ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-zinc-950 border border-white/20 rounded-[2px] text-xs font-mono text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-zinc-400 animate-pulse" />
            <span>[BUSCANDO PARES...]</span>
          </div>
        ) : syncStatus.isSyncing ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-zinc-900 border border-white/30 rounded-[2px] text-xs font-mono text-white">
            <RefreshCw className="w-3 h-3 text-white animate-spin" />
            <span>{syncStatus.peersAhead ? "[VERIFICANDO...]" : `[SYNCING ${syncStatus.progressPercentage}%]`}</span>
          </div>
        ) : currentBlock === 0 ? (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-zinc-950 border border-white/20 rounded-[2px] text-xs font-mono text-zinc-300">
            <RefreshCw className="w-3 h-3 text-white animate-spin" />
            <span>[INICIANDO CADENA #0]</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 px-2.5 py-0.5 bg-white/10 border border-white/30 rounded-[2px] text-xs font-mono text-white font-bold">
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>[SYNCED]</span>
          </div>
        )}

        <div className="flex items-center space-x-2 text-xs font-mono">
          <Activity className="w-4 h-4 text-white" />
          <span className="text-zinc-400">Bloque:</span>
          <span className="text-white font-bold">#{currentBlock}</span>
        </div>

        {/* Multi-Wallet Dropdown Selector */}
        {unlockedAddress ? (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center space-x-2.5 px-3 py-1.5 bg-[#0A0A0C] hover:bg-zinc-900 border border-white/15 hover:border-white/40 rounded-[2px] text-xs transition"
            >
              <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]" />
              <div className="flex flex-col items-start leading-tight">
                <div className="flex items-center space-x-1.5">
                  <span className="font-semibold text-white truncate max-w-[120px]">
                    {activeWallet?.name || "Billetera"}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400">
                    ({unlockedAddress.slice(0, 6)}...{unlockedAddress.slice(-4)})
                  </span>
                </div>
                <span className="font-mono text-[10px] text-white font-bold mt-0.5">
                  {activeBalance} ROGUE
                </span>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-zinc-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-80 bg-[#0A0A0C] border border-white/20 rounded-[2px] shadow-2xl overflow-hidden z-50 animate-in fade-in duration-100">
                <div className="p-3 border-b border-white/10 flex items-center justify-between bg-black">
                  <div className="flex items-center space-x-1.5">
                    <Wallet className="w-3.5 h-3.5 text-white" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">[BILLETERAS]</span>
                  </div>
                  <span className="text-[10px] bg-zinc-900 text-zinc-300 px-1.5 py-0.5 rounded-[2px] font-mono border border-white/10">
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
                        className={`rounded-[2px] border transition ${
                          isWalletActive
                            ? "bg-white/10 border-white/40"
                            : "bg-black border-white/10 hover:border-white/25"
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
                                  <span className="text-[9px] bg-white text-black font-bold px-1 rounded-[2px] font-mono">
                                    ACTIVA
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[10px] text-zinc-400 block truncate">
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
                              className={`p-1.5 rounded-[2px] transition ml-1.5 ${
                                walletToDelete === w.id
                                  ? "bg-white text-black font-bold"
                                  : "text-zinc-500 hover:text-white hover:bg-zinc-900"
                              }`}
                              title={walletToDelete === w.id ? "Clic para confirmar eliminación" : "Eliminar billetera"}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Collapsible Derived Accounts of this Wallet */}
                        {isExpanded && isWalletActive && derivedAccounts.length > 0 && (
                          <div className="px-3 pb-2.5 pt-1 space-y-1 border-t border-white/10 bg-black">
                            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                              [CUENTAS DERIVADAS ({derivedAccounts.length})]
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
                                  className={`flex items-center justify-between p-1.5 rounded-[2px] text-xs font-mono cursor-pointer transition ${
                                    isAccountActive
                                      ? "bg-white text-black font-bold"
                                      : "text-zinc-400 hover:text-white hover:bg-zinc-900"
                                  }`}
                                >
                                  <div className="flex items-center space-x-1.5 truncate">
                                    <span className="text-[10px]">#{acc.index + 1}</span>
                                    <span className="truncate">{acc.name || `${acc.address.slice(0, 6)}...${acc.address.slice(-4)}`}</span>
                                  </div>
                                  {isAccountActive && <Check className="w-3.5 h-3.5 text-black shrink-0" />}
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
                    <span>Crear Nueva Billetera</span>
                  </button>

                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      onOpenWalletModal("import");
                    }}
                    className="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-[2px] text-xs text-zinc-300 hover:text-white hover:bg-white/10 transition"
                  >
                    <Download className="w-3.5 h-3.5 text-white" />
                    <span>Importar Mnemónico Existente</span>
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
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white text-black font-bold hover:bg-zinc-200 border border-white rounded-[2px] text-xs transition shadow-[0_0_15px_rgba(255,255,255,0.15)]"
            >
              <ShieldAlert className="w-4 h-4 text-black" />
              <span>Desbloquear Billetera</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
