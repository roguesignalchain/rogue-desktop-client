import React, { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
        `${t("settings.detectedCpu")}: ${res.cpuCores} ${t("settings.logicalCores", { cores: res.cpuCores })}, ${(
          res.availableRamMb / 1024
        ).toFixed(1)} GB ${t("settings.availableRam")}.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(t("settings.actions.cleanError", { msg }));
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
    setLocalRpc("http://127.0.0.1:38845");
    setLocalLock(15);
    setDatadir("./nodes-local/node-desktop");
    setHttpPort(38845);
    setWsPort(0);
    setP2pPort(38888);
    setBootnodes("");
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
        setActionMessage(t("settings.actions.stoppingNode"));
        await onStopNode();
        setActionMessage(t("settings.actions.nodeStopped"));
      } else {
        setActionMessage(t("settings.actions.startingNode"));
        await onStartNode();
        setActionMessage(t("settings.actions.nodeStarted"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(`Error: ${msg}`);
    }
  };

  const handleConfirmCleanChaindata = async () => {
    try {
      setIsResettingDb(true);
      setActionMessage(t("settings.actions.cleaningDb"));
      await onCleanChaindata(datadir);
      setActionMessage(t("settings.actions.cleanSuccess"));
      setShowDangerConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionMessage(t("settings.actions.cleanError", { msg }));
    } finally {
      setIsResettingDb(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-[2px] space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <SettingsIcon className="w-5 h-5 text-white" />
            <h1 className="text-sm font-bold text-white uppercase tracking-wider">
              {t("settings.title")}
            </h1>
          </div>
          <span className="text-[11px] text-zinc-400 font-mono">Chain ID: 800055 (Rogue Signal)</span>
        </div>

        {/* Manual Node Control Section */}
        <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-[2px] flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Server className="w-4 h-4 text-white" />
              <span className="text-xs font-bold text-white">
                {t("settings.manualControlTitle")}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {t("settings.statusLabel")}{" "}
              <span className={nodeStatus.running ? "text-white font-bold" : "text-zinc-500"}>
                {nodeStatus.running
                  ? t("settings.statusRunning", { pid: nodeStatus.pid })
                  : t("settings.statusStopped")}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleManualToggleNode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-[2px] text-xs font-semibold transition ${
              nodeStatus.running
                ? "bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800"
                : "bg-white hover:bg-zinc-200 text-black font-bold"
            }`}
          >
            {nodeStatus.running ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("settings.stopNodeBtn")}</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t("settings.resumeNodeBtn")}</span>
              </>
            )}
          </button>
        </div>

        {actionMessage && (
          <div className="p-3 bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 rounded-[2px]">
            {actionMessage}
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-6">
          {/* Subprocess Configuration */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center space-x-2 text-xs font-semibold text-white">
              <Server className="w-4 h-4" />
              <span>{t("settings.networkPortsTitle")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t("settings.p2pPort")}
                </label>
                <input
                  type="number"
                  value={p2pPort}
                  onChange={(e) => setP2pPort(parseInt(e.target.value) || 38888)}
                  placeholder="38888"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {t("settings.p2pHint")}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t("settings.httpPort")}
                </label>
                <input
                  type="number"
                  value={httpPort}
                  onChange={(e) => {
                    const port = parseInt(e.target.value) || 38845;
                    setHttpPort(port);
                  }}
                  placeholder="38845"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {t("settings.httpHint")}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t("settings.wsPort")}
                </label>
                <input
                  type="number"
                  value={wsPort}
                  onChange={(e) => setWsPort(parseInt(e.target.value, 10) || 0)}
                  placeholder="38846"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {t("settings.wsHint")}
                </span>
              </div>
            </div>

            {/* Datadir */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-white" />
                <span>{t("settings.datadirLabel")}</span>
              </label>
              <input
                type="text"
                value={datadir}
                onChange={(e) => setDatadir(e.target.value)}
                placeholder="./nodes-local/node-desktop"
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                {t("settings.datadirHint")}
              </span>
            </div>

            {/* Bootnodes */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1.5">
                <Network className="w-3.5 h-3.5 text-white" />
                <span>{t("settings.bootnodesLabel")}</span>
              </label>
              <input
                type="text"
                value={bootnodes}
                onChange={(e) => setBootnodes(e.target.value)}
                placeholder="enode://..."
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">
                {t("settings.bootnodesHint")}
              </span>
            </div>

            {/* Hardware Verification & Safe Resources Section */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-[2px] space-y-3 mt-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-white">
                  <Activity className="w-4 h-4" />
                  <span>{t("settings.resourcesTitle")}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCheckSystemResources}
                  disabled={checkingSpecs}
                  className="flex items-center space-x-1.5 px-3 py-1.5 bg-black hover:bg-white/10 border border-white/20 text-white rounded-[2px] text-xs font-mono font-semibold transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${checkingSpecs ? "animate-spin" : ""}`} />
                  <span>{checkingSpecs ? t("settings.verifyingResources") : t("settings.verifyResourcesBtn")}</span>
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                {t("settings.resourcesDesc")}
              </p>

              {specs && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                  <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-[2px]">
                    <span className="text-[10px] text-zinc-400 uppercase block">
                      {t("settings.detectedCpu")}
                    </span>
                    <span className="text-xs font-mono font-bold text-white block truncate">
                      {t("settings.logicalCores", { cores: specs.cpuCores })}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 block truncate">
                      {specs.cpuModel}
                    </span>
                  </div>

                  <div className="p-2.5 bg-zinc-900/80 border border-zinc-800 rounded-[2px]">
                    <span className="text-[10px] text-zinc-400 uppercase block">
                      {t("settings.availableRam")}
                    </span>
                    <span className="text-xs font-mono font-bold text-white block">
                      {t("settings.freeGb", { free: (specs.availableRamMb / 1024).toFixed(1) })}
                    </span>
                    <span className="text-[10px] font-mono text-zinc-400 block">
                      {t("settings.totalRamStats", {
                        total: (specs.totalRamMb / 1024).toFixed(1),
                        freeMb: specs.availableRamMb,
                      })}
                    </span>
                  </div>

                  <div className="p-2.5 bg-white/5 border border-white/15 rounded-[2px]">
                    <span className="text-[10px] text-zinc-300 uppercase font-semibold flex items-center space-x-1">
                      <ShieldCheck className="w-3 h-3" />
                      <span>{t("settings.safeSuggested")}</span>
                    </span>
                    <span className="text-xs font-mono font-bold text-white block">
                      {t("settings.suggestedSettings", {
                        threads: specs.recommendedThreads,
                        cache: specs.recommendedCacheMb,
                      })}
                    </span>
                    <span className="text-[10px] text-zinc-400 block">
                      {t("settings.randomxModeLight")}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Performance and Cache Profile */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1 flex items-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-white" />
                  <span>{t("settings.cacheLimitLabel")}</span>
                </label>
                <select
                  value={cache}
                  onChange={(e) => setCache(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value={256}>{t("settings.cacheOptions.256")}</option>
                  <option value={512}>{t("settings.cacheOptions.512")}</option>
                  <option value={1024}>{t("settings.cacheOptions.1024")}</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t("settings.syncmodeLabel")}
                </label>
                <select
                  value={syncmode}
                  onChange={(e) => setSyncmode(e.target.value as "full" | "snap")}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value="full">{t("settings.syncmodeOptions.full")}</option>
                  <option value="snap" disabled>{t("settings.syncmodeOptions.snap")}</option>
                </select>
                <span className="text-[10px] text-zinc-500 mt-1 block">
                  {t("settings.syncmodeHint")}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1">
                  {t("settings.verbosityLabel")}
                </label>
                <select
                  value={verbosity}
                  onChange={(e) => setVerbosity(parseInt(e.target.value))}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
                >
                  <option value={2}>{t("settings.verbosityOptions.2")}</option>
                  <option value={3}>{t("settings.verbosityOptions.3")}</option>
                  <option value={4}>{t("settings.verbosityOptions.4")}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-4 space-y-4">
            {/* Dashboard RPC Connection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                  <Network className="w-4 h-4 text-white" />
                  <span>{t("settings.dashboardRpcTitle")}</span>
                </div>
                <button
                  type="button"
                  onClick={syncRpcWithNodePort}
                  className="text-[10px] text-white hover:text-zinc-300 underline"
                >
                  {t("settings.syncLocalPort", { port: httpPort })}
                </button>
              </div>
              <div>
                <input
                  type="text"
                  value={localRpc}
                  onChange={(e) => setLocalRpc(e.target.value)}
                  placeholder="http://127.0.0.1:38845"
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3.5 py-2 text-xs font-mono text-white outline-none"
                />
              </div>
            </div>

            {/* Auto-Lock */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-zinc-300">
                <Shield className="w-4 h-4 text-white" />
                <span>{t("settings.autoLockTitle")}</span>
              </div>
              <select
                value={localLock}
                onChange={(e) => setLocalLock(parseInt(e.target.value))}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none"
              >
                <option value={5}>{t("settings.autoLockOptions.5")}</option>
                <option value={15}>{t("settings.autoLockOptions.15")}</option>
                <option value={30}>{t("settings.autoLockOptions.30")}</option>
                <option value={0}>{t("settings.autoLockOptions.0")}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-3 pt-3 border-t border-zinc-800">
            <button
              type="submit"
              className="flex items-center space-x-2 px-5 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)] transition"
            >
              <Save className="w-4 h-4" />
              <span>{saved ? t("settings.savedSuccess") : t("settings.saveChanges")}</span>
            </button>

            <button
              type="button"
              onClick={handleResetDefaults}
              className="flex items-center space-x-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[2px] text-xs font-medium transition"
            >
              <RotateCcw className="w-4 h-4" />
              <span>{t("settings.resetDefaults")}</span>
            </button>
          </div>
        </form>

        {/* Danger Zone: Clean Chaindata */}
        <div className="mt-8 pt-6 border-t border-red-900/40 space-y-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-red-400 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span>{t("settings.dangerZoneTitle")}</span>
          </div>
          <p className="text-xs text-zinc-400">
            {t("settings.dangerZoneDesc")}
          </p>

          {!showDangerConfirm ? (
            <button
              type="button"
              onClick={() => setShowDangerConfirm(true)}
              className="px-4 py-2 bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-red-300 rounded-[2px] text-xs font-semibold transition"
            >
              {t("settings.cleanChaindataBtn")}
            </button>
          ) : (
            <div className="p-4 bg-red-950/40 border border-red-800 rounded-[2px] space-y-3">
              <p className="text-xs text-red-200 font-medium">
                {t("settings.cleanChaindataConfirm")}
              </p>
              <div className="flex items-center space-x-3">
                <button
                  type="button"
                  disabled={isResettingDb}
                  onClick={handleConfirmCleanChaindata}
                  className="flex items-center space-x-2 px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-[2px] text-xs font-bold transition disabled:opacity-50"
                >
                  {isResettingDb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>{t("settings.confirmCleanBtn")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDangerConfirm(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[2px] text-xs transition"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
