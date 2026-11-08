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
} from "lucide-react";
import { api } from "../services/api";
import { AccountInfo } from "../types";

interface DerivedAccountWithBalance extends AccountInfo {
  balance: string;
}

interface WalletViewProps {
  unlockedAddress: string | null;
  balance: string;
  rpcUrl: string;
  onRefreshBalance: () => void;
  onOpenWalletModal: () => void;
  onSelectAddress?: (address: string) => void;
}

export const WalletView: React.FC<WalletViewProps> = ({
  unlockedAddress,
  balance,
  rpcUrl,
  onRefreshBalance,
  onOpenWalletModal,
  onSelectAddress,
}) => {
  // Mnemonic Seed Phrase State
  const [mnemonic, setMnemonic] = useState<string>("");
  const [showMnemonic, setShowMnemonic] = useState<boolean>(false);
  const [copiedMnemonic, setCopiedMnemonic] = useState<boolean>(false);
  const [loadingMnemonic, setLoadingMnemonic] = useState<boolean>(false);

  // Derived Accounts State
  const [derivedAccounts, setDerivedAccounts] = useState<DerivedAccountWithBalance[]>([]);
  const [derivedCount, setDerivedCount] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_derived_count");
    return saved ? Math.max(1, parseInt(saved, 10)) : 1;
  });
  const [loadingAccounts, setLoadingAccounts] = useState<boolean>(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedPrivKey, setCopiedPrivKey] = useState<number | null>(null);
  const [revealedPrivKeys, setRevealedPrivKeys] = useState<{ [index: number]: string }>({});

  // Transfer Form State
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [gasTier, setGasTier] = useState<"slow" | "normal" | "fast">("normal");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  // Load derived accounts whenever unlockedAddress or derivedCount changes
  const loadDerivedAccounts = async (count: number) => {
    if (!unlockedAddress) return;
    try {
      setLoadingAccounts(true);
      const accounts = await api.getDerivedAccounts(count);
      const accountsWithBalance: DerivedAccountWithBalance[] = await Promise.all(
        accounts.map(async (acc) => {
          try {
            const bal = await api.getBalance(rpcUrl, acc.address);
            return { ...acc, balance: bal };
          } catch {
            return { ...acc, balance: "0.0000" };
          }
        })
      );
      setDerivedAccounts(accountsWithBalance);
    } catch (err) {
      console.warn("Failed to load derived accounts:", err);
    } finally {
      setLoadingAccounts(false);
    }
  };

  useEffect(() => {
    if (unlockedAddress) {
      loadDerivedAccounts(derivedCount);
    }
  }, [unlockedAddress, derivedCount, rpcUrl]);

  // Handle Mnemonic view & copy
  const handleToggleMnemonic = async () => {
    if (showMnemonic) {
      setShowMnemonic(false);
      return;
    }
    if (!mnemonic) {
      try {
        setLoadingMnemonic(true);
        const phrase = await api.getMnemonic();
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
      if (!phrase) {
        phrase = await api.getMnemonic();
        setMnemonic(phrase);
      }
      await navigator.clipboard.writeText(phrase);
      setCopiedMnemonic(true);
      setTimeout(() => setCopiedMnemonic(false), 2000);
    } catch (err) {
      console.warn("Failed to copy mnemonic:", err);
    }
  };

  // Handle Deriving New Address
  const handleDeriveAccount = async () => {
    const nextCount = derivedCount + 1;
    setDerivedCount(nextCount);
    localStorage.setItem("rogue_derived_count", nextCount.toString());
    await loadDerivedAccounts(nextCount);
  };

  // Handle Copy Address
  const handleCopyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Handle Copy Private Key
  const handleCopyPrivateKey = async (index: number) => {
    try {
      const privKey = await api.getPrivateKey(index);
      await navigator.clipboard.writeText(privKey);
      setCopiedPrivKey(index);
      setTimeout(() => setCopiedPrivKey(null), 2500);
    } catch (err) {
      console.error("Failed to copy private key:", err);
    }
  };

  // Handle Toggle Reveal Private Key
  const handleToggleRevealPrivateKey = async (index: number) => {
    if (revealedPrivKeys[index]) {
      setRevealedPrivKeys((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    } else {
      try {
        const privKey = await api.getPrivateKey(index);
        setRevealedPrivKeys((prev) => ({ ...prev, [index]: privKey }));
      } catch (err) {
        console.error("Failed to reveal private key:", err);
      }
    }
  };

  // Handle Send Transaction
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
        text: `¡Transacción transmitida exitosamente! TxHash: ${txHash}`,
      });
      setRecipient("");
      setAmount("");
      onRefreshBalance();
      loadDerivedAccounts(derivedCount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setStatusMsg({ type: "error", text: `Error al enviar transacción: ${msg}` });
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
        <h2 className="text-xl font-bold text-white">Billetera Bloqueada o No Inicializada</h2>
        <p className="text-sm text-zinc-400 max-w-md">
          Tu billetera determinista BIP-39 está cifrada de forma segura con Argon2id y AES-256-GCM. Desbloquea tu bóveda o crea una nueva para enviar y recibir ROGUE.
        </p>
        <button
          onClick={onOpenWalletModal}
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
      {/* Active Account Overview Card */}
      <div className="p-6 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-bold text-rose-400 uppercase tracking-wider">
                Dirección Activa Seleccionada
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/60 font-mono">
                Activa
              </span>
            </div>
            <div className="mt-2 flex items-center space-x-2 font-mono text-sm text-white">
              <span className="bg-zinc-950 px-3 py-1.5 rounded-lg border border-zinc-800 select-all">
                {unlockedAddress}
              </span>
              <button
                onClick={() => handleCopyAddress(unlockedAddress)}
                className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition"
                title="Copiar dirección activa"
              >
                {copiedAddress === unlockedAddress ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
            </div>
            <div className="text-[11px] text-zinc-500 font-mono mt-1.5 flex items-center space-x-2">
              <span>BIP-44 Estándar EVM</span>
              <span>•</span>
              <span>Todas las transacciones y minería se asocian a esta dirección</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Saldo Disponible</span>
            <div className="text-3xl font-black text-amber-400 font-mono mt-1">
              {balance} <span className="text-sm font-bold text-zinc-400">ROGUE</span>
            </div>
          </div>
        </div>
      </div>

      {/* BIP-39 Mnemonic Seed Phrase Section */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <Key className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                Frase de Recuperación Mnemónica (Seed Phrase)
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                BIP-39 determinista de 12 palabras para restaurar todas tus cuentas y llaves privadas
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleToggleMnemonic}
              disabled={loadingMnemonic}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
            >
              {showMnemonic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span>{showMnemonic ? "Ocultar Frase" : "Ver Frase Semilla"}</span>
            </button>

            <button
              onClick={handleCopyMnemonic}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
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
                <strong>Precaución de Seguridad:</strong> Nunca compartas tu frase semilla con terceros ni la almacenes en servicios en la nube sin cifrar. Cualquiera con acceso a estas 12 palabras tiene control total sobre todos tus fondos y direcciones derivadas.
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center space-x-2 font-mono">
              <span className="tracking-widest text-zinc-600">•••••••• •••••••• •••••••• ••••••••</span>
              <span className="text-zinc-500 text-[11px]">(12 palabras protegidas)</span>
            </div>
            <span className="text-zinc-500 text-[11px]">Haz clic en "Ver Frase Semilla" para revelarla</span>
          </div>
        )}
      </div>

      {/* Derived Addresses (BIP-44) Section */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-zinc-800">
          <div className="flex items-center space-x-2.5">
            <Layers className="w-5 h-5 text-cyan-400" />
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Direcciones Derivadas (BIP-44)
                </h2>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-zinc-300 border border-zinc-700">
                  {derivedAccounts.length} {derivedAccounts.length === 1 ? "cuenta" : "cuentas"}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                Rutas deterministas generadas a partir de la misma semilla maestra
              </p>
            </div>
          </div>

          <button
            onClick={handleDeriveAccount}
            disabled={loadingAccounts}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Agregar Dirección Derivada</span>
          </button>
        </div>

        {/* List of Derived Accounts */}
        <div className="space-y-3">
          {derivedAccounts.map((acc) => {
            const isActive = acc.address.toLowerCase() === unlockedAddress?.toLowerCase();
            const isPrivKeyRevealed = !!revealedPrivKeys[acc.index];

            return (
              <div
                key={acc.address}
                className={`p-4 rounded-xl border transition ${
                  isActive
                    ? "bg-rose-950/15 border-rose-500/40 shadow-sm"
                    : "bg-zinc-950/70 border-zinc-800/80 hover:border-zinc-700"
                }`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  {/* Account Metadata & Address */}
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="text-xs font-bold text-white">
                        Cuenta #{acc.index + 1}
                      </span>
                      {acc.index === 0 && (
                        <span className="text-[10px] bg-rose-950/60 text-rose-300 border border-rose-800/60 px-1.5 py-0.5 rounded font-mono">
                          Principal (Default)
                        </span>
                      )}
                      <span className="text-[11px] font-mono text-zinc-500 bg-zinc-900 px-1.5 py-0.5 rounded border border-zinc-800">
                        {acc.path}
                      </span>
                      {isActive ? (
                        <span className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-2 py-0.5 rounded-full font-mono font-semibold">
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
                      <span className="font-mono text-xs sm:text-sm text-zinc-200 truncate select-all">
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

                  {/* Balance and Action Buttons */}
                  <div className="flex items-center justify-between lg:justify-end space-x-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-zinc-800/60">
                    <div className="text-right">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">Saldo</div>
                      <div className="text-sm font-bold font-mono text-amber-400">
                        {acc.balance} <span className="text-[10px] text-zinc-400">ROGUE</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      {/* Copy Private Key Button */}
                      <button
                        onClick={() => handleCopyPrivateKey(acc.index)}
                        className="flex items-center space-x-1 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-lg transition"
                        title="Copiar llave privada al portapapeles"
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

                      {/* View / Toggle Private Key Button */}
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
                        <span>Llave Privada (ECDSA secp256k1)</span>
                      </span>
                      <span className="text-[10px] text-zinc-500">Formato Hexadecimal (64 caracteres)</span>
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

                    <p className="text-[10px] text-zinc-500">
                      Esta llave privada permite firmar transacciones directamente sin restricciones. Mantenla confidencial.
                    </p>
                  </div>
                )}
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
