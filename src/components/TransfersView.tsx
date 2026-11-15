import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  Send,
  Copy,
  Check,
  Shield,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet as WalletIcon,
  CheckCircle2,
  AlertCircle,
  Zap,
  Compass,
} from "lucide-react";
import { api } from "../services/api";
import { AccountInfo, ExplorerRoute, WalletSummary } from "../types";
import { parseEther, formatEther, isAddress } from "viem";
import { VoxelAvatar } from "./VoxelAvatar";

interface DerivedAccountItem extends AccountInfo {
  balance: string;
  name: string;
}

interface TransfersViewProps {
  unlockedAddress: string | null;
  activeWallet: WalletSummary | null;
  balance: string;
  rpcUrl: string;
  onRefreshBalance: () => void;
  onOpenWalletModal: (mode?: "unlock" | "create" | "import") => void;
  onSelectAddress?: (address: string) => void;
  onOpenInExplorer?: (route: ExplorerRoute) => void;
}

export const TransfersView: React.FC<TransfersViewProps> = ({
  unlockedAddress,
  activeWallet,
  balance,
  rpcUrl,
  onRefreshBalance,
  onOpenWalletModal,
  onSelectAddress,
  onOpenInExplorer,
}) => {
  const { t } = useTranslation();

  const [accounts, setAccounts] = useState<DerivedAccountItem[]>([]);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasTier, setGasTier] = useState<"slow" | "normal" | "fast">("normal");
  const [statusMsg, setStatusMsg] = useState<{
    type: "success" | "error" | "info";
    text: string;
    txHash?: string;
  } | null>(null);
  const [sending, setSending] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState<string | null>(null);
  const [copiedTxHash, setCopiedTxHash] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);

  const loadAccounts = useCallback(async () => {
    if (!activeWallet) return;
    try {
      const rawAccounts = await api.getDerivedAccounts(activeWallet.id);
      const metaKey = `rogue_account_meta_${activeWallet.id}`;
      let metaMap: Record<string, { name: string; categoryId: string; order: number }> = {};
      try {
        const saved = localStorage.getItem(metaKey);
        if (saved) metaMap = JSON.parse(saved);
      } catch {
        metaMap = {};
      }

      const enriched = await Promise.all(
        rawAccounts.map(async (acc) => {
          let bal: string;
          try {
            bal = await api.getBalance(rpcUrl, acc.address);
          } catch {
            bal = "0.0000";
          }
          const meta = metaMap[acc.address.toLowerCase()];
          return {
            ...acc,
            balance: bal,
            name:
              meta?.name ||
              (acc.index === 0
                ? t("wallet.mainAccount")
                : t("wallet.accountNumber", { index: acc.index + 1 })),
          };
        })
      );
      setAccounts(enriched);
    } catch {
      // Derived accounts unavailable while locked
    }
  }, [activeWallet?.id, rpcUrl, t]);

  useEffect(() => {
    setRecipient("");
    setAmount("");
    setStatusMsg(null);
  }, [activeWallet?.id, unlockedAddress]);

  useEffect(() => {
    loadAccounts();
    const handler = () => loadAccounts();
    window.addEventListener("rogue-account-meta-updated", handler);
    return () => window.removeEventListener("rogue-account-meta-updated", handler);
  }, [loadAccounts]);

  const getTierGasPriceWei = (tier: "slow" | "normal" | "fast"): bigint => {
    const gwei = tier === "slow" ? 1n : tier === "normal" ? 2n : 5n;
    return gwei * 1_000_000_000n;
  };

  const estimatedFeeWei = 21000n * getTierGasPriceWei(gasTier);
  const estimatedFeeRogue = formatEther(estimatedFeeWei);

  const handleSetPercentage = async (pct: number) => {
    if (!unlockedAddress) return;
    try {
      const balWei = await api.getBalanceWei(rpcUrl, unlockedAddress);
      if (pct === 100) {
        const maxWei = balWei > estimatedFeeWei ? balWei - estimatedFeeWei : 0n;
        setAmount(formatEther(maxWei));
      } else {
        const targetWei = (balWei * BigInt(pct)) / 100n;
        setAmount(formatEther(targetWei));
      }
    } catch {
      const num = parseFloat(balance);
      if (!isNaN(num)) {
        setAmount(((num * pct) / 100).toFixed(4));
      }
    }
  };

  const handleCopy = (text: string, type: "addr" | "tx") => {
    navigator.clipboard.writeText(text);
    if (type === "addr") {
      setCopiedAddr(text);
      setTimeout(() => setCopiedAddr(null), 2000);
    } else {
      setCopiedTxHash(true);
      setTimeout(() => setCopiedTxHash(false), 2000);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockedAddress) {
      setStatusMsg({ type: "error", text: t("wallet.errors.unlockFirst") });
      return;
    }
    if (!isAddress(recipient)) {
      setStatusMsg({ type: "error", text: t("wallet.errors.invalidRecipient") });
      return;
    }

    let wei: bigint;
    try {
      wei = parseEther(amount.trim());
    } catch {
      setStatusMsg({ type: "error", text: t("wallet.errors.invalidAmount") });
      return;
    }
    if (wei <= 0n) {
      setStatusMsg({ type: "error", text: t("wallet.errors.invalidAmount") });
      return;
    }

    try {
      setSending(true);
      setStatusMsg({ type: "info", text: t("wallet.status.sending") });

      const [nonce, networkGasPrice, estimatedGas, balWei] = await Promise.all([
        api.getNonce(rpcUrl, unlockedAddress),
        api.getGasPrice(rpcUrl),
        api.estimateGas(rpcUrl, {
          from: unlockedAddress,
          to: recipient,
          value: "0x" + wei.toString(16),
        }),
        api.getBalanceWei(rpcUrl, unlockedAddress),
      ]);
      const tierGasPrice = getTierGasPriceWei(gasTier);
      const gasPriceWei = networkGasPrice > tierGasPrice ? networkGasPrice : tierGasPrice;
      const maxFeeWei = BigInt(estimatedGas) * gasPriceWei;
      if (balWei < wei + maxFeeWei) {
        setStatusMsg({
          type: "error",
          text: t("wallet.errors.insufficientFunds", {
            defaultValue: "Insufficient balance to cover amount plus gas fee.",
          }),
        });
        return;
      }

      const activeAcc = accounts.find(
        (a) => a.address.toLowerCase() === unlockedAddress.toLowerCase()
      );
      const rawTx = await api.signRawTransaction({
        to: recipient,
        valueWeiHex: "0x" + wei.toString(16),
        gasLimit: estimatedGas,
        gasPriceHex: "0x" + gasPriceWei.toString(16),
        nonce,
        chainId: 800055,
        walletId: activeWallet?.id,
        accountIndex: activeAcc?.index ?? 0,
      });

      const txHash = await api.callRpc<string>(rpcUrl, "eth_sendRawTransaction", [rawTx]);
      setStatusMsg({
        type: "success",
        text: t("wallet.status.success", { txHash }),
        txHash,
      });
      setRecipient("");
      setAmount("");
      onRefreshBalance();
      loadAccounts();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ type: "error", text: t("wallet.errors.sendFailed", { error: msg }) });
    } finally {
      setSending(false);
    }
  };

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

  const activeAccount = accounts.find(
    (a) => a.address.toLowerCase() === unlockedAddress.toLowerCase()
  );
  const otherAccounts = accounts.filter(
    (a) => a.address.toLowerCase() !== unlockedAddress.toLowerCase()
  );

  const parsedAmountNum = parseFloat(amount);
  const parsedFeeNum = parseFloat(estimatedFeeRogue);
  const totalDebit =
    !isNaN(parsedAmountNum) && parsedAmountNum > 0
      ? (parsedAmountNum + parsedFeeNum).toFixed(6)
      : null;

  const recipientHasInput = recipient.length > 0;
  const recipientValid = isAddress(recipient);

  return (
    <div className="space-y-6">
      {/* Main 2-column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Send Form (7 cols) */}
        <div className="lg:col-span-7 p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
            <div className="flex items-center space-x-2">
              <ArrowUpRight className="w-4 h-4 text-white" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {t("wallet.transferTitle")}
              </h2>
            </div>
          </div>

          {/* Source Account Card */}
          <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-[2px] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
                {t("transfers.fromAccount")}
              </span>
              {accounts.length > 1 && onSelectAddress && (
                <button
                  type="button"
                  onClick={() => setShowSourcePicker(!showSourcePicker)}
                  className="text-[11px] font-mono text-zinc-300 hover:text-white underline underline-offset-2"
                >
                  {t("transfers.switchAccount")}
                </button>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center space-x-2.5 min-w-0">
                <VoxelAvatar seed={unlockedAddress} size={32} className="border border-zinc-800 bg-zinc-950 p-0.5" />
                <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-xs font-bold text-white truncate">
                    {activeAccount?.name || activeWallet.name}
                  </span>
                  {activeAccount && (
                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded-[2px] border border-zinc-800">
                      {activeAccount.path}
                    </span>
                  )}
                </div>
                <div className="text-xs font-mono text-zinc-400 truncate mt-0.5">
                  {unlockedAddress}
                </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-black font-mono text-white">
                  {activeAccount ? activeAccount.balance : balance}{" "}
                  <span className="text-[10px] text-zinc-400 font-normal">ROGUE</span>
                </div>
              </div>
            </div>

            {showSourcePicker && accounts.length > 1 && onSelectAddress && (
              <div className="pt-2 mt-2 border-t border-zinc-800/80 space-y-1 max-h-40 overflow-y-auto">
                {accounts.map((acc) => {
                  const isCurrent = acc.address.toLowerCase() === unlockedAddress.toLowerCase();
                  return (
                    <button
                      key={acc.address}
                      type="button"
                      onClick={() => {
                        onSelectAddress(acc.address);
                        setShowSourcePicker(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-[2px] text-left text-xs transition ${
                        isCurrent
                          ? "bg-white/10 text-white border border-white/25"
                          : "hover:bg-zinc-900 text-zinc-300 border border-transparent"
                      }`}
                    >
                      <div className="flex items-center space-x-2 min-w-0">
                        <VoxelAvatar seed={acc.address} size={20} className="border border-zinc-800 bg-zinc-950" />
                        <span className="font-semibold truncate">{acc.name}</span>
                        <span className="text-[10px] font-mono text-zinc-500">
                          {acc.address.slice(0, 6)}...{acc.address.slice(-4)}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-zinc-300 shrink-0">
                        {acc.balance} ROGUE
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleSend} className="space-y-4">
            {/* Recipient */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {t("wallet.recipientAddress")}
                </label>
                {recipientHasInput && (
                  <span
                    className={`text-[10px] font-mono flex items-center space-x-1 ${
                      recipientValid ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {recipientValid ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{t("transfers.validAddress")}</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-3 h-3" />
                        <span>{t("transfers.invalidAddressHint")}</span>
                      </>
                    )}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value.trim())}
                placeholder="0x..."
                className={`w-full bg-zinc-950 border rounded-[2px] px-3.5 py-2.5 text-sm text-white font-mono outline-none transition ${
                  recipientHasInput
                    ? recipientValid
                      ? "border-emerald-500/50 focus:border-emerald-400"
                      : "border-rose-500/50 focus:border-rose-400"
                    : "border-zinc-800 focus:border-white"
                }`}
                required
              />

              {/* Quick own-account chips */}
              {otherAccounts.length > 0 && (
                <div className="mt-2 flex items-center flex-wrap gap-1.5">
                  <span className="text-[10px] text-zinc-500 font-mono mr-1">
                    {t("transfers.sendToOwn")}
                  </span>
                  {otherAccounts.slice(0, 4).map((acc) => (
                    <button
                      key={acc.address}
                      type="button"
                      onClick={() => setRecipient(acc.address)}
                      className="text-[10px] font-mono px-2 py-0.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white rounded-[2px] transition"
                    >
                      {acc.name} ({acc.address.slice(0, 6)}...{acc.address.slice(-4)})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Amount */}
            <div>
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                <span>{t("wallet.transferAmount")}</span>
                <span className="font-mono text-[11px]">
                  {t("wallet.availableBalance", {
                    balance: activeAccount ? activeAccount.balance : balance,
                  })}
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2.5 text-base font-bold text-white font-mono outline-none transition pr-44"
                  required
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center space-x-1">
                  {[25, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => handleSetPercentage(pct)}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] text-zinc-300 hover:text-white rounded-[2px] font-mono transition"
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => handleSetPercentage(100)}
                    className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] text-white font-bold rounded-[2px] font-mono transition"
                  >
                    {t("wallet.max")}
                  </button>
                </div>
              </div>
            </div>

            {/* Gas Speed Presets */}
            <div>
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                {t("wallet.gasSpeedTitle")}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {(
                  [
                    {
                      id: "slow",
                      label: t("wallet.gas.slow"),
                      fee: "1 Gwei",
                      rogueFee: "0.000021 ROGUE",
                      time: "~60s",
                    },
                    {
                      id: "normal",
                      label: t("wallet.gas.normal"),
                      fee: "2 Gwei",
                      rogueFee: "0.000042 ROGUE",
                      time: "~30s",
                    },
                    {
                      id: "fast",
                      label: t("wallet.gas.fast"),
                      fee: "5 Gwei",
                      rogueFee: "0.000105 ROGUE",
                      time: "<30s",
                    },
                  ] as const
                ).map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setGasTier(tier.id)}
                    className={`p-3 rounded-[2px] border text-center transition ${
                      gasTier === tier.id
                        ? "bg-white/10 border-white text-white shadow-[0_0_12px_rgba(255,255,255,0.08)]"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-center space-x-1">
                      {tier.id === "fast" && <Zap className="w-3 h-3" />}
                      <span>{tier.label}</span>
                    </div>
                    <div className="text-[11px] font-mono mt-1 text-zinc-200">
                      {tier.fee} • {tier.time}
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      {tier.rogueFee}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Transaction Summary */}
            <div className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-[2px] space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>{t("transfers.estimatedFee")}</span>
                <span className="text-zinc-200">{estimatedFeeRogue} ROGUE</span>
              </div>
              {totalDebit && (
                <div className="flex justify-between text-white font-bold pt-1 border-t border-zinc-800/80">
                  <span>{t("transfers.totalDebit")}</span>
                  <span>{totalDebit} ROGUE</span>
                </div>
              )}
            </div>

            {/* Status Message */}
            {statusMsg && (
              <div
                className={`p-3 rounded-[2px] text-xs font-mono border space-y-2 ${
                  statusMsg.type === "success"
                    ? "bg-emerald-950/30 border-emerald-700/60 text-emerald-200"
                    : statusMsg.type === "error"
                    ? "bg-rose-950/40 border-rose-800 text-rose-200"
                    : "bg-zinc-900 border-zinc-700 text-zinc-300"
                }`}
              >
                <div className="break-all">{statusMsg.text}</div>
                {statusMsg.txHash && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopy(statusMsg.txHash!, "tx")}
                      className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-[2px] text-[11px] text-white transition"
                    >
                      {copiedTxHash ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>{t("common.copied")}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{t("transfers.copyTxHash")}</span>
                        </>
                      )}
                    </button>
                    {onOpenInExplorer && (
                      <button
                        type="button"
                        onClick={() => onOpenInExplorer({ view: "tx", hash: statusMsg.txHash! })}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 rounded-[2px] text-[11px] text-sky-300 hover:text-white transition"
                      >
                        <Compass className="w-3 h-3" />
                        <span>{t("explorer.viewInExplorer", "View in Explorer")}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={sending}
              className="w-full flex items-center justify-center space-x-2 py-3 bg-white hover:bg-zinc-200 disabled:opacity-50 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.12)] transition"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? t("wallet.transmitting") : t("wallet.sendRogue")}</span>
            </button>
          </form>
        </div>

        {/* Right: Receive & Other Accounts (5 cols) */}
        <div className="lg:col-span-5 space-y-5">
          {/* Receive Card */}
          <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-4">
            <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800/80">
              <ArrowDownLeft className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                {t("transfers.receiveTitle")}
              </h2>
            </div>

            <p className="text-xs text-zinc-400">{t("transfers.receiveDesc")}</p>

            <div className="p-3.5 bg-zinc-950 border border-zinc-800 rounded-[2px] space-y-2">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-white">
                  {activeAccount?.name || activeWallet.name}
                </span>
                {activeAccount && (
                  <span className="font-mono text-zinc-500">{activeAccount.path}</span>
                )}
              </div>
              <div className="p-2.5 bg-black border border-zinc-800/80 rounded-[2px] font-mono text-xs text-zinc-200 break-all select-all">
                {unlockedAddress}
              </div>
              <button
                type="button"
                onClick={() => handleCopy(unlockedAddress, "addr")}
                className="w-full flex items-center justify-center space-x-2 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white rounded-[2px] text-xs font-mono transition"
              >
                {copiedAddr === unlockedAddress ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t("common.copied")}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>{t("wallet.copyActiveAddress")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Other Vault Accounts Quick List */}
          {otherAccounts.length > 0 && (
            <div className="p-5 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-3">
              <div className="flex items-center space-x-2 pb-2.5 border-b border-zinc-800/80">
                <WalletIcon className="w-4 h-4 text-zinc-300" />
                <div>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    {t("transfers.otherAccountsTitle")}
                  </h3>
                  <p className="text-[11px] text-zinc-500 mt-0.5">
                    {t("transfers.otherAccountsDesc")}
                  </p>
                </div>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {otherAccounts.map((acc) => (
                  <div
                    key={acc.address}
                    className="p-3 bg-zinc-950/80 border border-zinc-800/80 rounded-[2px] space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{acc.name}</div>
                        <div className="text-[11px] font-mono text-zinc-500 truncate">
                          {acc.address.slice(0, 10)}...{acc.address.slice(-8)}
                        </div>
                      </div>
                      <div className="text-xs font-mono font-bold text-zinc-200 shrink-0">
                        {acc.balance} <span className="text-[10px] text-zinc-500">ROGUE</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pt-1 border-t border-zinc-900">
                      {onSelectAddress && (
                        <button
                          type="button"
                          onClick={() => onSelectAddress(acc.address)}
                          className="flex-1 py-1 px-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:text-white rounded-[2px] transition"
                        >
                          {t("transfers.useAsSource")}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setRecipient(acc.address)}
                        className="flex-1 py-1 px-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-[10px] font-mono text-zinc-300 hover:text-white rounded-[2px] transition"
                      >
                        {t("transfers.useAsRecipient")}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopy(acc.address, "addr")}
                        className="p-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-[2px] transition"
                        title={t("wallet.copyAddress")}
                      >
                        {copiedAddr === acc.address ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

