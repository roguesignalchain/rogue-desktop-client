import React, { useState } from "react";
import {
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  Shield,
  Network,
  Server,
  HardDrive,
  Cpu,
  AlertTriangle,
  Play,
  Square,
  RefreshCw,
  Activity,
  ShieldCheck,
} from "lucide-react";
import { NodeStatus, SystemSpecs } from "../types";
import { api } from "../services/api";

interface SettingsViewProps {
  rpcUrl: string;
  onSaveRpcUrl: (url: string) => void;
  autoLockMinutes: number;
  onSaveAutoLockMinutes: (mins: number) => void;
  nodeDatadir: string;
  nodeHttpPort: number;
  nodeWsPort: number;
  nodeP2pPort: number;
  nodeBootnodes: string;
  nodeCache?: number;
  nodeSyncmode?: "full" | "snap";
  nodeVerbosity?: number;
  nodeStatus: NodeStatus;
  onStartNode: () => Promise<void>;
  onStopNode: () => Promise<void>;
  onCleanChaindata: (datadir?: string) => Promise<void>;
  onSaveNodeConfig: (config: {
    datadir: string;
    httpPort: number;
    wsPort: number;
    p2pPort: number;
    bootnodes: string;
    cache: number;
    syncmode: "full" | "snap";
    verbosity: number;
  }) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  rpcUrl,
  onSaveRpcUrl,
  autoLockMinutes,
  onSaveAutoLockMinutes,
  nodeDatadir,
  nodeHttpPort,
  nodeWsPort,
  nodeP2pPort,
  nodeBootnodes,
  nodeCache = 256,
  nodeSyncmode = "full",
  nodeVerbosity = 3,
  nodeStatus,
  onStartNode,
  onStopNode,
  onCleanChaindata,
  onSaveNodeConfig,
}) => {
  const [localRpc, setLocalRpc] = useState(rpcUrl);
  const [localLock, setLocalLock] = useState(autoLockMinutes);
  const [datadir, setDatadir] = useState(nodeDatadir);
  const [httpPort, setHttpPort] = useState(nodeHttpPort);
  const [wsPort, setWsPort] = useState(nodeWsPort);
  const [p2pPort, setP2pPort] = useState(nodeP2pPort);
  const [bootnodes, setBootnodes] = useState(nodeBootnodes);
  const [cache, setCache] = useState(nodeCache);
  const [syncmode, setSyncmode] = useState<"full" | "snap">(nodeSyncmode);
  const [verbosity, setVerbosity] = useState(nodeVerbosity);

  const [saved, setSaved] = useState(false);
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [specs, setSpecs] = useState<SystemSpecs | null>(null);
  const [checkingSpecs, setCheckingSpecs] = useState<boolean>(false);

  const handleCheckSystemResources = async () => {
    try {
      setCheckingSpecs(true);
      const res = await api.getSystemSpecs();
      setSpecs(res);
      setCache(res.recommendedCacheMb);
      setActionMessage(
        `Diagnóstico de hardware: ${res.cpuCores} núcleos (${res.cpuModel}), ${(
          res.availableRamMb / 1024
        ).toFixed(1)} GB RAM libre. Caché recomendada ajustada a ${res.recommendedCacheMb} MB.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(`Error al verificar recursos del sistema: ${msg}`);
    } finally {
      setCheckingSpecs(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRpcUrl(localRpc);
    onSaveAutoLockMinutes(localLock);
    onSaveNodeConfig({
      datadir,
      httpPort,
      wsPort,
      p2pPort,
      bootnodes,
      cache,
      syncmode,
      verbosity,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleResetDefaults = () => {
    setLocalRpc("http://127.0.0.1:38849");
    setLocalLock(15);
    setDatadir("./nodes-local/node-desktop");
    setHttpPort(38849);
    setWsPort(38850);
    setP2pPort(38890);
    setBootnodes(
      "enode://3bfcd978ea35fc817c5573b03e7b76cb7367720d4ff7a1fdb7ddcb83ec2ad6cba997029305678d49e1dbfccc83a20ecea0d4920a483a8e4d86ebe212b06bcefc@127.0.0.1:38888"
    );
    setCache(256);
    setSyncmode("full");
    setVerbosity(3);
  };

  const syncRpcWithNodePort = () => {
    setLocalRpc(`http://127.0.0.1:${httpPort}`);
  };

  const handleManualToggleNode = async () => {
    try {
      if (nodeStatus.running) {
        setActionMessage("Deteniendo el nodo...");
        await onStopNode();
        setActionMessage("Nodo detenido manualmente.");
      } else {
        setActionMessage("Iniciando el nodo...");
        await onStartNode();
        setActionMessage("Nodo iniciado correctamente.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(`Error: ${msg}`);
    }
  };

  const handleConfirmCleanChaindata = async () => {
    try {
      setIsResettingDb(true);
      setActionMessage("Borrando base de datos y re-inicializando bloque Génesis...");
      await onCleanChaindata(datadir);
      setActionMessage("Cadena reseteada con éxito. El nodo comenzará la re-sincronización.");
      setShowDangerConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(`Error al resetear base de datos: ${msg}`);
    } finally {
      setIsResettingDb(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-rose-500" />
            <h1 className="text-sm font-bold text-white uppercase tracking-wider">
              Configuración de Cliente & Nodo
            </h1>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">Chain ID: 800055 (Rogue Signal)</span>
        </div>

        {/* Manual Node Control Section */}
        <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-rose-400" />
              <span className="text-xs font-bold text-white">Control Manual del Proceso de Nodo</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              Estado:{" "}
              <span className={nodeStatus.running ? "text-emerald-400 font-bold" : "text-zinc-500"}>
                {nodeStatus.running ? `En ejecución (PID: ${nodeStatus.pid})` : "Detenido"}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleManualToggleNode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition ${
              nodeStatus.running
                ? "bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800"
                : "bg-emerald-600 hover:bg-emerald-500 text-white"
            }`}
          >
            {nodeStatus.running ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Pausar / Detener Nodo</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Reanudar Nodo</span>
              </>
            )}
          </button>
        </div>

        {actionMessage && (
          <div className="p-3 bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 rounded-lg">
            {actionMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Subprocess Configuration */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-rose-400">
              <Server className="w-4 h-4" />
              <span>Red y Puertos del Nodo Core-Geth</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Puerto P2P</label>
                <input
                  type="number"
                  value={p2pPort}
                  onChange={(e) => setP2pPort(parseInt(e.target.value) || 38890)}
                  placeholder="38890"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">DevP2P Gossip (Por defecto: 38890)</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Puerto HTTP RPC</label>
                <input
                  type="number"
                  value={httpPort}
                  onChange={(e) => {
                    const port = parseInt(e.target.value) || 38849;
                    setHttpPort(port);
                  }}
                  placeholder="38849"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">API Local (Por defecto: 38849)</span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Puerto WebSocket</label>
                <input
                  type="number"
                  value={wsPort}
                  onChange={(e) => setWsPort(parseInt(e.target.value) || 38850)}
                  placeholder="38850"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Flujo de Eventos (Por defecto: 38850)</span>
              </div>
            </div>

            {/* Datadir */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                <span>Directorio de Datos de la Blockchain (--datadir)</span>
              </label>
              <input
                type="text"
                value={datadir}
                onChange={(e) => setDatadir(e.target.value)}
                placeholder="./nodes-local/node-desktop"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Ubicación del chaindata, keystore y logs del nodo de escritorio.
              </span>
            </div>

            {/* Bootnodes */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <Network className="w-3.5 h-3.5 text-amber-400" />
                <span>Bootnodes de la Red (URLs Enode)</span>
              </label>
              <input
                type="text"
                value={bootnodes}
                onChange={(e) => setBootnodes(e.target.value)}
                placeholder="enode://..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-amber-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                Enodes separados por comas para descubrir pares automáticamente al iniciar.
              </span>
            </div>

            {/* Hardware Verification & Safe Resources Section */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-xl space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-cyan-400">
                  <Activity className="w-4 h-4" />
                  <span>Verificación de Recursos del Sistema (CPU y Memoria)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckSystemResources}
                  disabled={checkingSpecs}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-cyan-950/70 hover:bg-cyan-900/80 border border-cyan-700/60 text-cyan-200 rounded-lg text-xs font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingSpecs ? "animate-spin" : ""}`} />
                  <span>{checkingSpecs ? "Verificando..." : "Verificar Recursos del Sistema"}</span>
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                Analiza los núcleos y la memoria RAM de tu computador para determinar cuánta memoria caché y cuántos núcleos utilizar con total seguridad.
              </p>

              {specs && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg">
                    <span className="text-[10px] text-zinc-400 uppercase block">CPU Detectada</span>
                    <span className="text-xs font-mono font-bold text-white block truncate">
                      {specs.cpuCores} Núcleos Lógicos
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 block truncate">
                      {specs.cpuModel}
                    </span>
                  </div>

                  <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-lg">
                    <span className="text-[10px] text-zinc-400 uppercase block">Memoria RAM Disponible</span>
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      {(specs.availableRamMb / 1024).toFixed(1)} GB Libres
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 block">
                      Total: {(specs.totalRamMb / 1024).toFixed(1)} GB ({specs.availableRamMb} MB libres)
                    </span>
                  </div>

                  <div className="p-2.5 bg-emerald-950/20 border border-emerald-800/50 rounded-lg">
                    <span className="text-[10px] text-emerald-300 uppercase font-semibold flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>Ajuste Seguro Sugerido</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-emerald-400 block">
                      {specs.recommendedThreads} Hilos / Caché {specs.recommendedCacheMb} MB
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      Modo RandomX: Light Mode (256 MB)
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Performance and Cache Profile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-rose-400" />
                  <span>Límite de Caché RAM</span>
                </label>
                <select
                  value={cache}
                  onChange={(e) => setCache(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value={256}>256 MB (Recomendado - Ligero)</option>
                  <option value={512}>512 MB (Equilibrado)</option>
                  <option value={1024}>1024 MB (Alto Rendimiento)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Modo de Sincronización</label>
                <select
                  value={syncmode}
                  onChange={(e) => setSyncmode(e.target.value as "full" | "snap")}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="full">Full (Obligatorio - Validación Completa PoW RandomX)</option>
                  <option value="snap" disabled>Snap (Deshabilitado en redes PoW por riesgo de desincronización)</option>
                </select>
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  El algoritmo RandomX requiere validación de bloques completos desde el génesis.
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">Verbosidad de Logs</label>
                <select
                  value={verbosity}
                  onChange={(e) => setVerbosity(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-rose-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value={2}>Nivel 2 (Solo Warnings/Errores)</option>
                  <option value={3}>Nivel 3 (Info - Estándar)</option>
                  <option value={4}>Nivel 4 (Debug - Detallado)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-4">
            {/* Dashboard RPC Connection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                  <Network className="w-4 h-4 text-cyan-400" />
                  <span>Endpoint RPC para el Dashboard</span>
                </div>
                <button
                  type="button"
                  onClick={syncRpcWithNodePort}
                  className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                >
                  Sincronizar con puerto local ({httpPort})
                </button>
              </div>
              <div>
                <input
                  type="text"
                  value={localRpc}
                  onChange={(e) => setLocalRpc(e.target.value)}
                  placeholder="http://127.0.0.1:38849"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500 rounded-lg px-3.5 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
            </div>

            {/* Auto-Lock */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                <Shield className="w-4 h-4 text-emerald-400" />
                <span>Bloqueo Automático por Inactividad</span>
              </div>
              <select
                value={localLock}
                onChange={(e) => setLocalLock(parseInt(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value={5}>5 minutos</option>
                <option value={15}>15 minutos (Recomendado)</option>
                <option value={30}>30 minutos</option>
                <option value={0}>No bloquear automáticamente</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-3 border-t border-zinc-800">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-md transition"
            >
              <Save className="w-4 h-4" />
              <span>{saved ? "Guardado con Éxito" : "Guardar Cambios"}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Restaurar Valores por Defecto</span>
            </button>
          </div>
        </form>

        {/* Danger Zone: Clean Chaindata */}
        <div className="mt-8 pt-6 border-t border-red-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-red-400 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>Zona de Mantenimiento / Reseteo de Cadena</span>
          </div>
          <p className="text-xs text-zinc-400">
            Si la base de datos local se corrompe o deseas sincronizar completamente desde el bloque 0, puedes forzar una re-sincronización. Esto reinicializará la base de datos con el Génesis oficial.
          </p>

          {!showDangerConfirm ? (
            <button
              type="button"
              onClick={() => setShowDangerConfirm(true)}
              className="px-4 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 rounded-lg text-xs font-semibold transition"
            >
              Forzar Re-sincronización / Limpiar Chaindata
            </button>
          ) : (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg space-y-3">
              <p className="text-xs text-red-200 font-medium">
                ¿Estás seguro de que deseas borrar los datos locales de la blockchain? Deberás descargar nuevamente todos los bloques de la red.
              </p>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  disabled={isResettingDb}
                  onClick={handleConfirmCleanChaindata}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
                >
                  {isResettingDb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Sí, Borrar y Re-sincronizar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDangerConfirm(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs transition"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
