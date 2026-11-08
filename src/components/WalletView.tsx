import React, { useState } from "react";
import { Send, Copy, Check, Shield } from "lucide-react";
import { api } from "../services/api";

interface WalletViewProps {
  unlockedAddress: string | null;
  balance: string;
  rpcUrl: string;
  onRefreshBalance: () => void;
  onOpenWalletModal: () => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  unlockedAddress,
  balance,
  rpcUrl,
  onRefreshBalance,
  onOpenWalletModal,
}) => {
  const [copied, setCopied] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasTier, setGasTier] = useState<"slow" | "normal" | "fast">("normal");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const handleCopy = () => {
    if (!unlockedAddress) return;
    navigator.clipboard.writeText(unlockedAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unlockedAddress) {
      setStatusMsg({ type: "error", text: "Please unlock your wallet first." });
      return;
    }
    if (!recipient.startsWith("0x") || recipient.length !== 42) {
      setStatusMsg({ type: "error", text: "Invalid Ethereum/Rogue recipient address." });
      return;
    }
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setStatusMsg({ type: "error", text: "Enter a valid ROGUE amount." });
      return;
    }

    try {
      setSending(true);
      setStatusMsg({ type: "info", text: "Estimating gas and submitting transaction..." });

      // Convert amount to Wei (18 decimals)
      const wei = BigInt(Math.floor(parsedAmount * 1e6)) * BigInt(10 ** 12);
      const valueHex = "0x" + wei.toString(16);

      // Gas price priority presets (in Gwei)
      const priorityGwei = gasTier === "slow" ? 1 : gasTier === "normal" ? 2 : 5;
      const maxPriorityFeeHex = "0x" + (BigInt(priorityGwei) * BigInt(10 ** 9)).toString(16);

      // Send transaction via RPC
      const txParams = {
        from: unlockedAddress,
        to: recipient,
        value: valueHex,
        gas: "0x5208", // 21,000 standard transfer
        maxPriorityFeePerGas: maxPriorityFeeHex,
      };

      const txHash = await api.callRpc<string>(rpcUrl, "eth_sendTransaction", [txParams]);
      setStatusMsg({
        type: "success",
        text: `Transaction broadcasted successfully! TxHash: ${txHash}`,
      });
      setRecipient("");
      setAmount("");
      onRefreshBalance();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ type: "error", text: `Transaction failed: ${msg}` });
    } finally {
      setSending(false);
    }
  };

  if (!unlockedAddress) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/40 border border-zinc-800 rounded-xl text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500">
          <Shield className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white">Wallet Locked or Unconfigured</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Your wallet is securely encrypted with Argon2id and AES-256-GCM. Unlock your vault or generate a new deterministic BIP-39 wallet to send and receive ROGUE.
        </p>
        <button
          onClick={onOpenWalletModal}
          className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition"
        >
          Unlock / Initialize Vault
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Account Info Card */}
      <div className="p-6 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Account Address (BIP-44)</span>
            <div className="mt-1 flex items-center space-x-2 font-mono text-sm text-white">
              <span>{unlockedAddress}</span>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white transition"
                title="Copy address"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-0.5">Path: m/44'/60'/0'/0/0 (EVM Standard)</div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Available Balance</span>
            <div className="text-3xl font-black text-amber-400 font-mono">
              {balance} <span className="text-sm font-bold text-zinc-400">ROGUE</span>
            </div>
          </div>
        </div>
      </div>

      {/* Send Transfer Card */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl">
        <div className="flex items-center space-x-2 pb-4 border-b border-zinc-800">
          <Send className="w-4 h-4 text-rose-500" />
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Transfer ROGUE (EIP-1559)</h2>
        </div>

        <form onSubmit={handleSend} className="mt-6 space-y-4 max-w-xl">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
              Recipient Address
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
              <span>Amount (ROGUE)</span>
              <span>Available: {balance} ROGUE</span>
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
              Transaction Speed / Priority Fee (EIP-1559)
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  { id: "slow", label: "Slow", fee: "1 Gwei", time: "~20s" },
                  { id: "normal", label: "Normal", fee: "2 Gwei", time: "~10s" },
                  { id: "fast", label: "Fast", fee: "5 Gwei", time: "<10s" },
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
            <span>{sending ? "Broadcasting Transaction..." : "Send ROGUE"}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
