import React, { useState, useEffect } from "react";
import {
  Pickaxe,
  Cpu,
  Play,
  Square,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Activity,
  HardDrive,
  ShieldCheck,
  Zap,
  Award,
  Wallet,
} from "lucide-react";
import { api } from "../services/api";
import { Block, NodeStatus, SyncStatus, SystemSpecs } from "../types";

interface MiningViewProps {
  hashrate: number;
  rpcUrl: string;
  unlockedAddress: string | null;
  nodeStatus?: NodeStatus;
  syncStatus?: SyncStatus;
  peerCount?: number;
  recentBlocks?: Block[];
  currentBlock?: number;
}

export const MiningView: React.FC<MiningViewProps> = ({
  hashrate,
  rpcUrl,
  unlockedAddress,
  nodeStatus,
  syncStatus,
  peerCount = 0,
  recentBlocks = [],
}) => {
  // Light Mode (~256 MB) is strictly the default at all times
  const [fastMode, setFastMode] = useState<boolean>(false);
  const [threads, setThreads] = useState<number>(2);
  const [isMining, setIsMining] = useState<boolean>(false);
  const [coinbaseAddr, setCoinbaseAddr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // System hardware diagnostics state
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [checkingSpecs, setCheckingSpecs] = useState<boolean>(false);

  // Blockchain is ready to mine when node is running, has at least 1 peer, and is not syncing
  const isNetworkSynced = (nodeStatus?.running ?? true) && peerCount > 0 && !(syncStatus?.isSyncing);

  // Load initial hardware specs on mount so core slider is accurate for the user's machine
  useEffect(() => {
    let mounted = true;
    api.getSystemSpecs().then((res) => {
      if (mounted) {
        setSpecs(res);
        setThreads(res.recommendedThreads);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Synchronize mining status and coinbase with node
  useEffect(() => {
    let mounted = true;
    const checkMining = async () => {
      try {
        const [mining, cb] = await Promise.all([
          api.isMining(rpcUrl),
          api.getCoinbase(rpcUrl),
        ]);
        if (mounted) {
          setIsMining(mining);
          if (cb && cb !== "0x0000000000000000000000000000000000000000") {
            setCoinbaseAddr(cb);
          }
        }
      } catch {
        // Node unreachable
      }
    };

    checkMining();
    const interval = setInterval(checkMining, 4000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [rpcUrl]);

  const handleCheckSystemResources = async () => {
    try {
      setCheckingSpecs(true);
      const res = await api.getSystemSpecs();
      setSpecs(res);
      setFeedback(
        `Diagnóstico completado: ${res.cpuCores} núcleos lógicos detectados y ${(
          res.availableRamMb / 1024
        ).toFixed(1)} GB de RAM libre disponible.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(`Error al verificar recursos del sistema: ${msg}`);
    } finally {
      setCheckingSpecs(false);
    }
  };

  const applyRecommendedSpecs = () => {
    if (!specs) return;
    setThreads(specs.recommendedThreads);
    setFastMode(false); // Always default to Light Mode for safety
    setFeedback(
      `Configuración recomendada aplicada: ${specs.recommendedThreads} hilos CPU (Perfil Equilibrado 50%) y Light Mode (~256 MB RAM).`
    );
  };

  const maxCores = specs?.cpuCores || 16;

  const selectProfile = (ratio: number, label: string) => {
    const calculated = Math.max(1, Math.round(maxCores * ratio));
    setThreads(calculated);
    setFeedback(`Perfil '${label}' seleccionado: ${calculated} de ${maxCores} hilos lógicos.`);
  };

  const handleModeChange = async (useFast: boolean) => {
    if (useFast && specs && !specs.canRunFastMode) {
      setFeedback(
        "⚠️ Atención: Tu sistema tiene menos de 3 GB de RAM libre. Se recomienda mantener Light Mode (256 MB) para evitar lentitud."
      );
    }
    setFastMode(useFast);
    if (isMining) {
      await api.setFastMode(rpcUrl, useFast);
      setFeedback(
        `Modo de memoria actualizado a ${
          useFast ? "Fast Mode (~2.08 GB RAM)" : "Light Mode (~256 MB RAM)"
        }.`
      );
    }
  };

  const handleToggleMining = async () => {
    try {
      if (!isMining) {
        if (!isNetworkSynced) {
          setFeedback(
            "⚠️ No es posible iniciar la minería mientras la blockchain se esté sincronizando o no tenga pares conectados."
          );
          return;
        }

        let payoutAddr = unlockedAddress || coinbaseAddr;
        if (!payoutAddr) {
          setFeedback(
            "⚠️ Desbloquea tu billetera primero en la pestaña Wallet para sincronizar automáticamente tu dirección receptora de recompensas."
          );
          return;
        }

        await api.startMining(rpcUrl, threads, payoutAddr, fastMode);
        setIsMining(true);
        setCoinbaseAddr(payoutAddr);
        setFeedback(
          `Minería CPU activa con ${threads} hilos (${
            fastMode ? "Fast Mode 2GB" : "Light Mode 256MB"
          }). Recompensas sincronizadas a: ${payoutAddr}`
        );
      } else {
        await api.stopMining(rpcUrl);
        setIsMining(false);
        setFeedback("Minería CPU detenida manualmente. El nodo continúa validando bloques en modo pasivo.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setFeedback(`Error en control de minería: ${msg}`);
    }
  };

  const activeRewardAddress = unlockedAddress || coinbaseAddr;
  const minedByMeCount = recentBlocks.filter(
    (b) =>
      activeRewardAddress &&
      b.miner &&
      b.miner.toLowerCase() === activeRewardAddress.toLowerCase()
  ).length;

  const formatHashrate = (hr: number) => {
    if (hr <= 0) return "0.00 H/s";
    return `${(hr / 1000).toFixed(2)} kH/s`;
  };

  const ramUsagePercent = specs
    ? Math.min(100, Math.round(((specs.totalRamMb - specs.availableRamMb) / specs.totalRamMb) * 100))
    : 50;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">[CONSENSUS ENGINE: RANDOMX RX/0]</div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2 font-display">
            <Pickaxe className="w-5 h-5 text-white" />
            <span>Minería Doméstica CPU — RandomX (rx/0)</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            Minería en solitario (Solo Mining) integrada directamente en el nodo para computadores caseros. 1 CPU = 1 Voto.
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right font-mono">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              [MIS BLOQUES MINADOS]
            </span>
            <span className="text-xl font-black text-white flex items-center justify-end space-x-1">
              <Award className="w-4 h-4 text-white" />
              <span>{minedByMeCount}</span>
            </span>
          </div>

          <div className="h-8 w-px bg-white/10" />

          <div className="text-right font-mono">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              [HASHRATE CPU LOCAL]
            </span>
            <span className="text-2xl font-black text-white">{formatHashrate(hashrate)}</span>
          </div>
        </div>
      </div>

      {/* Sync Readiness Banner */}
      {isNetworkSynced ? (
        <div className="p-4 bg-white/5 border border-white/20 rounded-[2px] flex items-center justify-between font-mono">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-[2px] bg-white/10 border border-white/30 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                [BLOCKCHAIN SINCRONIZADA — MOTOR CPU LISTO]
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                Nodo conectado con {peerCount} {peerCount === 1 ? "par" : "pares"}. Recompensa de bloque: 22.8 ROGUE al minero (24 ROGUE total • 30s target • Protección MESS + Reorg≤90 activa).
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-white px-2.5 py-1 bg-white/10 rounded-[2px] border border-white/30 font-bold">
            [SYNCED]
          </span>
        </div>
      ) : (
        <div className="p-4 bg-black border border-white/15 rounded-[2px] flex items-center justify-between font-mono">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-[2px] bg-black border border-white/20 flex items-center justify-center shrink-0">
              {peerCount === 0 ? (
                <AlertTriangle className="w-4 h-4 text-zinc-400" />
              ) : (
                <RefreshCw className="w-4 h-4 text-white animate-spin" />
              )}
            </div>
            <div>
              <h2 className="text-xs font-bold text-white uppercase tracking-wider">
                {peerCount === 0
                  ? "[BUSCANDO PARES DE RED...]"
                  : `[SINCRONIZANDO CADENA ${syncStatus?.progressPercentage || 0}%]`}
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                La minería requiere sincronización al 100% para evitar bloques huérfanos.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-400 px-2.5 py-1 bg-zinc-900 rounded-[2px] border border-white/10">
            [SYNC PENDING]
          </span>
        </div>
      )}

      {feedback && (
        <div className="p-3 bg-[#0A0A0C] border border-white/15 text-xs font-mono text-zinc-300 rounded-[2px] flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-zinc-500 hover:text-white text-[10px] ml-4 uppercase"
          >
            [CERRAR]
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Internal CPU Miner Control */}
        <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-white" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  [CONTROL DE MINERÍA CPU]
                </h2>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-[2px] font-mono ${
                  isMining
                    ? "bg-white text-black font-bold"
                    : "bg-black text-zinc-500 border border-white/10"
                }`}
              >
                {isMining ? "[MINING SOLO]" : "[STOPPED]"}
              </span>
            </div>

            {/* Active Reward Address (Etherbase) */}
            <div className="p-3 bg-black rounded-[2px] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center space-x-1.5 font-semibold uppercase tracking-wider font-mono">
                  <Wallet className="w-3.5 h-3.5 text-white" />
                  <span>[DIRECCIÓN RECEPTORA]</span>
                </span>
                <span className="text-white font-mono text-[10px]">[AUTOSYNC]</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 truncate">
                {activeRewardAddress || "Desbloquea tu billetera para asignar dirección"}
              </div>
            </div>

            {/* CPU Thread Profiles */}
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                <span>[PERFILES DE HILOS CPU]</span>
                <span className="text-white font-mono font-bold">
                  {threads} de {maxCores} Hilos ({Math.round((threads / maxCores) * 100)}%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => selectProfile(0.25, "Bajo impacto (25%)")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.25))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">25% HILOS</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    ({Math.max(1, Math.round(maxCores * 0.25))} hilos)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.5, "Equilibrado (50%)")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.5))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">50% HILOS</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    ({Math.max(1, Math.round(maxCores * 0.5))} hilos)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.75, "Máxima potencia (75%)")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads >= Math.max(1, Math.round(maxCores * 0.75))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">75% HILOS</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    ({Math.max(1, Math.round(maxCores * 0.75))} hilos)
                  </span>
                </button>
              </div>

              <div className="pt-1">
                <input
                  type="range"
                  min="1"
                  max={maxCores}
                  value={threads}
                  onChange={(e) => setThreads(parseInt(e.target.value, 10))}
                  className="w-full accent-white cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                  <span>1 Hilo</span>
                  <span>Ajuste fino manual</span>
                  <span>{maxCores} Hilos</span>
                </div>
              </div>
            </div>

            {/* RandomX Memory Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                [MODO DE MEMORIA RANDOMX]
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleModeChange(false)}
                  className={`p-3 rounded-[2px] border text-left transition font-mono ${
                    !fastMode
                      ? "bg-white/10 border-white text-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Light Mode</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-white text-black font-bold">
                      DEFAULT
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-300 mt-1">~256 MB RAM</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-sans">
                    Apto para todo equipo sin comprometer RAM.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange(true)}
                  className={`p-3 rounded-[2px] border text-left transition font-mono ${
                    fastMode
                      ? "bg-white/10 border-white text-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center space-x-1">
                      <Zap className="w-3 h-3 text-white" />
                      <span>Fast Mode</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-[2px] bg-zinc-800 text-zinc-300">
                      2 GB
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-300 mt-1">~2.08 GB RAM</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 font-sans">
                    Dataset completo en RAM (~4x velocidad).
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleToggleMining}
              disabled={!isMining && !isNetworkSynced}
              className={`w-full flex items-center justify-center space-x-2 py-3 rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold transition ${
                isMining
                  ? "bg-white/10 hover:bg-white/20 border border-white/40 text-white"
                  : !isNetworkSynced
                  ? "bg-zinc-900 border border-white/10 text-zinc-500 cursor-not-allowed"
                  : "bg-white hover:bg-zinc-200 text-black shadow-[0_0_20px_rgba(255,255,255,0.15)]"
              }`}
            >
              {isMining ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>[DETENER MINERÍA CPU]</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {!isNetworkSynced ? "[ESPERANDO SINCRONIZACIÓN...]" : "[INICIAR MINERÍA EN SOLITARIO]"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Card: System Resources Diagnostic & Safe Hardware Advisor */}
        <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-white" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                  [RECURSOS DEL SISTEMA]
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCheckSystemResources}
                disabled={checkingSpecs}
                className="flex items-center space-x-1.5 px-3 py-1 bg-black hover:bg-white/10 border border-white/20 text-white rounded-[2px] text-xs font-mono font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingSpecs ? "animate-spin" : ""}`} />
                <span>{checkingSpecs ? "Analizando..." : "Verificar Recursos"}</span>
              </button>
            </div>

            <p className="text-xs text-zinc-400 font-sans">
              Verifica las capacidades de tu computador en tiempo real para elegir cuántos núcleos y cuánta memoria dedicar a la minería sin comprometer la fluidez de tu equipo.
            </p>

            {specs ? (
              <div className="space-y-3 font-mono">
                {/* CPU Info Box */}
                <div className="p-3.5 bg-black border border-white/10 rounded-[2px] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-white" />
                      <span>Procesador Detectado</span>
                    </span>
                    <span className="text-white font-bold">
                      {specs.cpuCores} Núcleos Lógicos
                    </span>
                  </div>
                  <div className="text-xs text-zinc-300 truncate">{specs.cpuModel}</div>
                </div>

                {/* RAM Info Box */}
                <div className="p-3.5 bg-black border border-white/10 rounded-[2px] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-white" />
                      <span>Memoria RAM del Sistema</span>
                    </span>
                    <span className="text-white font-bold">
                      {(specs.availableRamMb / 1024).toFixed(1)} GB Libres /{" "}
                      {(specs.totalRamMb / 1024).toFixed(1)} GB Total
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-zinc-900 rounded-[1px] overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${ramUsagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>En uso: {ramUsagePercent}%</span>
                    <span>Disponible: {specs.availableRamMb} MB</span>
                  </div>
                </div>

                {/* Safe Recommendation Box */}
                <div className="p-3.5 bg-white/5 border border-white/15 rounded-[2px] space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-white">
                    <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                    <span>[RECOMENDACIÓN SEGURA]</span>
                  </div>
                  <ul className="text-[11px] text-zinc-300 space-y-1 pl-4 list-disc font-sans">
                    <li>
                      <strong>Hilos recomendados:</strong>{" "}
                      <span className="font-mono text-white font-bold">
                        {specs.recommendedThreads} hilos
                      </span>{" "}
                      (deja núcleos libres para uso diario).
                    </li>
                    <li>
                      <strong>Modo por defecto:</strong>{" "}
                      <span className="font-mono text-white">Light Mode (~256 MB)</span> para estabilidad.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                Haz clic en [Verificar Recursos] para analizar tu hardware.
              </div>
            )}
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={applyRecommendedSpecs}
              disabled={!specs}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-black hover:bg-white/10 disabled:opacity-40 border border-white/20 text-white rounded-[2px] text-xs font-mono font-semibold transition"
            >
              <ShieldCheck className="w-4 h-4 text-white" />
              <span>Aplicar Configuración Segura ({specs?.recommendedThreads || 2} Hilos + Light Mode)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
