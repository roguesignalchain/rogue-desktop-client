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
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <Pickaxe className="w-5 h-5 text-rose-500" />
            <span>Minería Doméstica CPU — RandomX (rx/0)</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Minería en solitario (Solo Mining) integrada directamente en el nodo para computadores caseros. 1 CPU = 1 Voto.
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right font-mono">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">
              Bloques Recientes Míos
            </span>
            <span className="text-xl font-black text-emerald-400 flex items-center justify-end space-x-1">
              <Award className="w-4 h-4 text-emerald-400" />
              <span>{minedByMeCount}</span>
            </span>
          </div>

          <div className="h-8 w-px bg-zinc-800" />

          <div className="text-right font-mono">
            <span className="text-[11px] text-zinc-400 uppercase tracking-wider block">
              Hashrate CPU Local
            </span>
            <span className="text-2xl font-black text-rose-400">{formatHashrate(hashrate)}</span>
          </div>
        </div>
      </div>

      {/* Sync Readiness Banner */}
      {isNetworkSynced ? (
        <div className="p-4 bg-emerald-950/30 border border-emerald-800/50 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                ¡Blockchain sincronizada! Motor CPU listo para minar
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Nodo conectado con {peerCount} {peerCount === 1 ? "par" : "pares"}. Cada bloque encontrado otorga 7.6 ROGUE directamente a tu billetera.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-emerald-400 px-2.5 py-1 bg-emerald-950/60 rounded border border-emerald-800/60">
            Sincronizado
          </span>
        </div>
      ) : (
        <div className="p-4 bg-amber-950/20 border border-amber-800/40 rounded-xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-amber-950/80 border border-amber-500/40 flex items-center justify-center shrink-0">
              {peerCount === 0 ? (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              ) : (
                <RefreshCw className="w-4 h-4 text-amber-400 animate-spin" />
              )}
            </div>
            <div>
              <h2 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                {peerCount === 0
                  ? "Esperando conexión con pares de la red..."
                  : `Sincronizando bloques (${syncStatus?.progressPercentage || 0}%)`}
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                La minería requiere que la cadena esté sincronizada al 100% para evitar minar bloques obsoletos.
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-amber-400 px-2.5 py-1 bg-amber-950/60 rounded border border-amber-800/60">
            En espera de Sync
          </span>
        </div>
      )}

      {feedback && (
        <div className="p-3 bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 rounded-lg flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-zinc-500 hover:text-zinc-300 text-[10px] ml-4 uppercase"
          >
            Cerrar
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Card: Internal CPU Miner Control */}
        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Cpu className="w-4 h-4 text-rose-500" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Control de Minería CPU
                </h2>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded font-mono ${
                  isMining
                    ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                    : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {isMining ? "MINANDO EN SOLITARIO" : "DETENIDO"}
              </span>
            </div>

            {/* Active Reward Address (Etherbase) */}
            <div className="p-3 bg-zinc-950/70 rounded-lg border border-zinc-800/80 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center space-x-1.5 font-semibold uppercase tracking-wider">
                  <Wallet className="w-3.5 h-3.5 text-rose-400" />
                  <span>Dirección Receptora (Etherbase)</span>
                </span>
                <span className="text-emerald-400 font-mono text-[10px]">Sincronización Automática</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 truncate">
                {activeRewardAddress || "Desbloquea tu billetera para asignar dirección"}
              </div>
            </div>

            {/* CPU Thread Profiles */}
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <span>Perfiles de Uso de CPU</span>
                <span className="text-white font-mono">
                  {threads} de {maxCores} Hilos ({Math.round((threads / maxCores) * 100)}%)
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => selectProfile(0.25, "Bajo impacto (25%)")}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.25))
                      ? "bg-emerald-500/15 border-emerald-500/60 text-emerald-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <span className="font-bold">Bajo Impacto</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    25% ({Math.max(1, Math.round(maxCores * 0.25))} hilos)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.5, "Equilibrado (50%)")}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.5))
                      ? "bg-rose-500/15 border-rose-500/60 text-rose-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <span className="font-bold">Equilibrado</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    50% ({Math.max(1, Math.round(maxCores * 0.5))} hilos)
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.75, "Máxima potencia (75%)")}
                  className={`py-2 px-2 rounded-lg border text-xs font-medium transition flex flex-col items-center ${
                    threads >= Math.max(1, Math.round(maxCores * 0.75))
                      ? "bg-amber-500/15 border-amber-500/60 text-amber-300"
                      : "bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  }`}
                >
                  <span className="font-bold">Máxima Potencia</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    75% ({Math.max(1, Math.round(maxCores * 0.75))} hilos)
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
                  className="w-full accent-rose-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                  <span>1 Hilo (Mínimo)</span>
                  <span>Ajuste fino manual</span>
                  <span>{maxCores} Hilos (100%)</span>
                </div>
              </div>
            </div>

            {/* RandomX Memory Mode Selector (Light Mode default always) */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Modo de Memoria RandomX
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleModeChange(false)}
                  className={`p-3 rounded-lg border text-left transition ${
                    !fastMode
                      ? "bg-rose-500/15 border-rose-500/60 text-white"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Light Mode</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                      Por Defecto
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 mt-1">~256 MB RAM</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Seguro para todo computador casero sin afectar otras apps.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeChange(true)}
                  className={`p-3 rounded-lg border text-left transition ${
                    fastMode
                      ? "bg-rose-500/15 border-rose-500/60 text-white"
                      : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold flex items-center space-x-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Fast Mode</span>
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                      Opcional
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-zinc-400 mt-1">~2.08 GB RAM</div>
                  <div className="text-[10px] text-zinc-500 mt-0.5">
                    Dataset completo en RAM (~4x velocidad si tienes &gt;3 GB libres).
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={handleToggleMining}
              disabled={!isMining && !isNetworkSynced}
              className={`w-full flex items-center justify-center space-x-2 py-3 rounded-lg text-sm font-semibold transition ${
                isMining
                  ? "bg-red-900/80 hover:bg-red-800 border border-red-700 text-white"
                  : !isNetworkSynced
                  ? "bg-zinc-800 border border-zinc-700 text-zinc-500 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950"
              }`}
            >
              {isMining ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>Detener Minería CPU</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {!isNetworkSynced ? "Esperando Sincronización..." : "Iniciar Minería en Solitario"}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Card: System Resources Diagnostic & Safe Hardware Advisor */}
        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-5 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center space-x-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                  Diagnóstico de Recursos del Sistema
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCheckSystemResources}
                disabled={checkingSpecs}
                className="flex items-center space-x-1.5 px-3 py-1 bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-200 rounded-lg text-xs font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingSpecs ? "animate-spin" : ""}`} />
                <span>{checkingSpecs ? "Analizando..." : "Verificar Recursos del Sistema"}</span>
              </button>
            </div>

            <p className="text-xs text-zinc-400">
              Verifica las capacidades de tu computador en tiempo real para elegir cuántos núcleos y cuánta memoria dedicar a la minería sin comprometer la fluidez ni la temperatura de tu equipo.
            </p>

            {specs ? (
              <div className="space-y-3">
                {/* CPU Info Box */}
                <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-rose-400" />
                      <span>Procesador Detectado</span>
                    </span>
                    <span className="font-mono text-white font-bold">
                      {specs.cpuCores} Núcleos Lógicos
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-300 truncate">{specs.cpuModel}</div>
                </div>

                {/* RAM Info Box */}
                <div className="p-3.5 bg-zinc-950/70 border border-zinc-800 rounded-lg space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Memoria RAM del Sistema</span>
                    </span>
                    <span className="font-mono text-emerald-400 font-bold">
                      {(specs.availableRamMb / 1024).toFixed(1)} GB Libres /{" "}
                      {(specs.totalRamMb / 1024).toFixed(1)} GB Total
                    </span>
                  </div>

                  <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        ramUsagePercent > 85 ? "bg-amber-500" : "bg-cyan-500"
                      }`}
                      style={{ width: `${ramUsagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>En uso: {ramUsagePercent}%</span>
                    <span>Disponible: {specs.availableRamMb} MB</span>
                  </div>
                </div>

                {/* Safe Recommendation Box */}
                <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-lg space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-emerald-300">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Recomendación Segura para tu Computador</span>
                  </div>
                  <ul className="text-[11px] text-zinc-300 space-y-1 pl-6 list-disc">
                    <li>
                      <strong>Hilos recomendados:</strong>{" "}
                      <span className="font-mono text-emerald-300">
                        {specs.recommendedThreads} hilos
                      </span>{" "}
                      (deja {specs.cpuCores - specs.recommendedThreads} núcleos libres para uso diario y control térmico).
                    </li>
                    <li>
                      <strong>Modo de memoria por defecto:</strong>{" "}
                      <span className="font-mono text-emerald-300">Light Mode (~256 MB)</span> activo para mínimo consumo.
                    </li>
                    <li>
                      <strong>Soporte Fast Mode (2.08 GB):</strong>{" "}
                      {specs.canRunFastMode ? (
                        <span className="text-emerald-400">
                          Tu equipo cuenta con suficiente RAM libre si deseas activarlo manualmente.
                        </span>
                      ) : (
                        <span className="text-amber-400">
                          Memoria libre ajustada; mantén Light Mode (256 MB) para máxima estabilidad.
                        </span>
                      )}
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                Haz clic en &quot;Verificar Recursos del Sistema&quot; para analizar tu hardware.
              </div>
            )}
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={applyRecommendedSpecs}
              disabled={!specs}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 border border-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold transition"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Aplicar Configuración Segura Recomendada ({specs?.recommendedThreads || 2} Hilos + Light Mode)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
