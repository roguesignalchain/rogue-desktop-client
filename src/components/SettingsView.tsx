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
  KeyRound,
  Check,
  X,
  Info,
  FolderOpen,
} from "lucide-react";
import { NodeStatus, SystemSpecs } from "../types";
import { api } from "../services/api";

interface SettingsViewProps {
  rpcUrl: string;
  onSaveRpcUrl: (url: string) => void;
  autoLockMinutes: number;
  onSaveAutoLockMinutes: (mins: number) => void;
  closeToTray: boolean;
  onSaveCloseToTray: (enabled: boolean) => void;
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
  closeToTray,
  onSaveCloseToTray,
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
  const [localCloseToTray, setLocalCloseToTray] = useState(closeToTray);
  const [datadir, setDatadir] = useState(nodeDatadir);
  const [p2pPortStr, setP2pPortStr] = useState(String(nodeP2pPort));
  const [httpPortStr, setHttpPortStr] = useState(String(nodeHttpPort));
  const [wsPortStr, setWsPortStr] = useState(String(nodeWsPort));
  const [bootnodes, setBootnodes] = useState(nodeBootnodes);
  const [cache, setCache] = useState(nodeCache);
  const [syncmode, setSyncmode] = useState<"full" | "snap">(nodeSyncmode);
  const [verbosity, setVerbosity] = useState(nodeVerbosity);

  const parsePort = (raw: string, fallback: number, allowZero: boolean = false): number => {
    const n = parseInt(raw.trim(), 10);
    if (Number.isNaN(n)) return fallback;
    if (allowZero && n === 0) return 0;
    if (n < 1 || n > 65535) return fallback;
    return n;
  };

  const p2pPort = parsePort(p2pPortStr, nodeP2pPort);
  const httpPort = parsePort(httpPortStr, nodeHttpPort);
  const wsPort = parsePort(wsPortStr, nodeWsPort, true);

  const [saved, setSaved] = useState(false);
  const [showDangerConfirm, setShowDangerConfirm] = useState(false);
  const [isResettingDb, setIsResettingDb] = useState(false);
  const [newMasterPass, setNewMasterPass] = useState("");
  const [confirmMasterPass, setConfirmMasterPass] = useState("");
  const [masterPassError, setMasterPassError] = useState<string | null>(null);
  const [masterPassSuccess, setMasterPassSuccess] = useState(false);
  const [changingMasterPass, setChangingMasterPass] = useState(false);

  const handleChangeMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMasterPassError(null);
    setMasterPassSuccess(false);
    if (!newMasterPass) {
      setMasterPassError(t("settings.masterPassEmpty"));
      return;
    }
    if (newMasterPass !== confirmMasterPass) {
      setMasterPassError(t("walletModal.errors.passwordMismatch"));
      return;
    }
    try {
      setChangingMasterPass(true);
      await api.changeMasterPassword(newMasterPass);
      setNewMasterPass("");
      setConfirmMasterPass("");
      setMasterPassSuccess(true);
      setTimeout(() => setMasterPassSuccess(false), 3000);
    } catch (err: unknown) {
      setMasterPassError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingMasterPass(false);
    }
  };
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
    onSaveCloseToTray(localCloseToTray);
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
    setDatadir("");
    setHttpPortStr("38845");
    setWsPortStr("0");
    setP2pPortStr("38888");
    setBootnodes("");
    setCache(256);
    setSyncmode("full");
    setVerbosity(3);
  };

  const handleBrowseDatadir = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (typeof selected === "string" && selected.trim()) {
        setDatadir(selected.trim());
      }
    } catch {
      // Ignore outside Tauri or cancelled
    }
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

  const hasUnsavedChanges =
    localRpc !== rpcUrl ||
    localLock !== autoLockMinutes ||
    localCloseToTray !== closeToTray ||
    datadir !== nodeDatadir ||
    httpPort !== nodeHttpPort ||
    wsPort !== nodeWsPort ||
    p2pPort !== nodeP2pPort ||
    bootnodes !== nodeBootnodes ||
    cache !== nodeCache ||
    syncmode !== nodeSyncmode ||
    verbosity !== nodeVerbosity;

  const inputBaseClass =
    "w-full bg-zinc-950 border border-zinc-800 focus:border-white rounded-[2px] px-3 py-2 text-xs font-mono text-white outline-none transition";
  const numberInputClass = `${inputBaseClass} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`;

  return (
    <div className="space-y-6">
      {/* Top Banner: Header & Manual Node Control */}
      <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest">
              {t("settings.badge")}
            </span>
            <span className="text-[10px] font-mono text-zinc-500 px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded-[2px]">
              Chain ID: 800055 (Rogue Signal)
            </span>
          </div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2 font-display">
            <SettingsIcon className="w-5 h-5 text-white" />
            <span>{t("settings.title")}</span>
          </h1>
        </div>

        {/* Manual Node Process Control */}
        <div className="p-3.5 bg-zinc-950/90 border border-zinc-800 rounded-[2px] flex items-center justify-between lg:justify-end gap-5">
          <div className="space-y-0.5">
            <div className="flex items-center space-x-2">
              <Server className="w-3.5 h-3.5 text-white" />
              <span className="text-xs font-bold text-white">
                {t("settings.manualControlTitle")}
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 font-mono">
              {t("settings.statusLabel")}{" "}
              <span className={nodeStatus.running ? "text-emerald-400 font-bold" : "text-zinc-500"}>
                {nodeStatus.running
                  ? t("settings.statusRunning", { pid: nodeStatus.pid })
                  : t("settings.statusStopped")}
              </span>
            </p>
          </div>

          <button
            type="button"
            onClick={handleManualToggleNode}
            className={`flex items-center space-x-2 px-4 py-2 rounded-[2px] text-xs font-semibold transition shrink-0 ${
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
      </div>

      {actionMessage && (
        <div className="px-4 py-3 bg-zinc-900/90 border border-zinc-700 text-xs font-mono text-zinc-200 rounded-[2px] flex items-center justify-between gap-3">
          <span>{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="text-zinc-400 hover:text-white transition"
            aria-label={t("common.close")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left Column: Core-Geth Node Configuration */}
        <form
          id="settings-config-form"
          onSubmit={handleSave}
          className="xl:col-span-7 space-y-6"
        >
          {/* Card 1: Network, Ports & Storage */}
          <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
            <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider font-mono">
              <Server className="w-4 h-4 text-white" />
              <span>{t("settings.networkPortsTitle")}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.p2pPort")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={p2pPortStr}
                  onChange={(e) => setP2pPortStr(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => setP2pPortStr(String(parsePort(p2pPortStr, 38888)))}
                  placeholder="38888"
                  className={numberInputClass}
                />
                <span className="text-[10px] text-zinc-500 mt-1.5 block">
                  {t("settings.p2pHint")}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.httpPort")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={httpPortStr}
                  onChange={(e) => setHttpPortStr(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => setHttpPortStr(String(parsePort(httpPortStr, 38845)))}
                  placeholder="38845"
                  className={numberInputClass}
                />
                <span className="text-[10px] text-zinc-500 mt-1.5 block">
                  {t("settings.httpHint")}
                </span>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.wsPort")}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={wsPortStr}
                  onChange={(e) => setWsPortStr(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={() => setWsPortStr(String(parsePort(wsPortStr, 0, true)))}
                  placeholder="38846"
                  className={numberInputClass}
                />
                <span className="text-[10px] text-zinc-500 mt-1.5 block">
                  {t("settings.wsHint")}
                </span>
              </div>
            </div>

            {/* Datadir */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center space-x-1.5">
                <HardDrive className="w-3.5 h-3.5 text-white" />
                <span>{t("settings.datadirLabel")}</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={datadir}
                  onChange={(e) => setDatadir(e.target.value)}
                  placeholder="OS Default (~/.local/share/rogue-signal/chaindata)"
                  className={inputBaseClass}
                />
                <button
                  type="button"
                  onClick={handleBrowseDatadir}
                  className="px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-white rounded-[2px] text-xs font-mono flex items-center space-x-1.5 shrink-0 transition"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
              </div>
              <span className="text-[10px] text-zinc-500 mt-1.5 block">
                {t("settings.datadirHint")}
              </span>
            </div>

            {/* Bootnodes */}
            <div>
              <label className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center space-x-1.5">
                <Network className="w-3.5 h-3.5 text-white" />
                <span>{t("settings.bootnodesLabel")}</span>
              </label>
              <textarea
                rows={2}
                value={bootnodes}
                onChange={(e) => setBootnodes(e.target.value)}
                placeholder="enode://..."
                className={`${inputBaseClass} resize-y break-all`}
              />
              <span className="text-[10px] text-zinc-500 mt-1.5 block">
                {t("settings.bootnodesHint")}
              </span>
            </div>
          </div>

          {/* Card 2: Hardware Verification & Performance Profile */}
          <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
            <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider font-mono">
              <Cpu className="w-4 h-4 text-white" />
              <span>{t("settings.performanceTitle")}</span>
            </div>

            {/* Hardware Verification */}
            <div className="p-4 bg-zinc-950/70 border border-zinc-800 rounded-[2px] space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center space-x-1">
                  <Cpu className="w-3.5 h-3.5 text-white" />
                  <span>{t("settings.cacheLimitLabel")}</span>
                </label>
                <select
                  value={cache}
                  onChange={(e) => setCache(parseInt(e.target.value))}
                  className={inputBaseClass}
                >
                  <option value={256}>{t("settings.cacheOptions.256")}</option>
                  <option value={512}>{t("settings.cacheOptions.512")}</option>
                  <option value={1024}>{t("settings.cacheOptions.1024")}</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.verbosityLabel")}
                </label>
                <select
                  value={verbosity}
                  onChange={(e) => setVerbosity(parseInt(e.target.value))}
                  className={inputBaseClass}
                >
                  <option value={2}>{t("settings.verbosityOptions.2")}</option>
                  <option value={3}>{t("settings.verbosityOptions.3")}</option>
                  <option value={4}>{t("settings.verbosityOptions.4")}</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.syncmodeLabel")}
                </label>
                <select
                  value="full"
                  disabled
                  className={`${inputBaseClass} opacity-75 cursor-not-allowed`}
                >
                  <option value="full">{t("settings.syncmodeOptions.full")}</option>
                </select>
                <span className="text-[10px] text-zinc-500 mt-1.5 block">
                  {t("settings.syncmodeHint")}
                </span>
              </div>
            </div>
          </div>
        </form>

        {/* Right Column: Client RPC, Session Security, Save Actions, Vault Password & Danger Zone */}
        <div className="xl:col-span-5 space-y-6">
          {/* Card 3: Client RPC & Session Security + Save Bar */}
          <div className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-5">
            <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider font-mono">
              <Shield className="w-4 h-4 text-white" />
              <span>{t("settings.clientSecurityTitle")}</span>
            </div>

            {/* Dashboard RPC Connection */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center space-x-1.5 text-[11px] font-medium text-zinc-400">
                  <Network className="w-3.5 h-3.5 text-white" />
                  <span>{t("settings.dashboardRpcTitle")}</span>
                </label>
                <button
                  type="button"
                  onClick={syncRpcWithNodePort}
                  className="text-[10px] font-mono text-white hover:text-zinc-300 underline shrink-0"
                >
                  {t("settings.syncLocalPort", { port: httpPort })}
                </button>
              </div>
              <input
                type="text"
                form="settings-config-form"
                value={localRpc}
                onChange={(e) => setLocalRpc(e.target.value)}
                placeholder="http://127.0.0.1:38845"
                className={inputBaseClass}
              />
            </div>

            {/* Auto-Lock */}
            <div className="space-y-1.5">
              <label className="flex items-center space-x-1.5 text-[11px] font-medium text-zinc-400">
                <Shield className="w-3.5 h-3.5 text-white" />
                <span>{t("settings.autoLockTitle")}</span>
              </label>
              <select
                form="settings-config-form"
                value={localLock}
                onChange={(e) => setLocalLock(parseInt(e.target.value))}
                className={inputBaseClass}
              >
                <option value={5}>{t("settings.autoLockOptions.5")}</option>
                <option value={15}>{t("settings.autoLockOptions.15")}</option>
                <option value={30}>{t("settings.autoLockOptions.30")}</option>
                <option value={0}>{t("settings.autoLockOptions.0")}</option>
              </select>
            </div>

            {/* Close to System Tray */}
            <div className="pt-2 border-t border-zinc-800/70">
              <label className="flex items-start space-x-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  form="settings-config-form"
                  checked={localCloseToTray}
                  onChange={(e) => setLocalCloseToTray(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-white rounded-[2px] bg-zinc-900 border-zinc-700"
                />
                <div className="space-y-0.5">
                  <span className="text-[11px] font-medium text-zinc-200 block">
                    {t("settings.closeToTrayLabel")}
                  </span>
                  <span className="text-[10px] text-zinc-500 block leading-relaxed">
                    {t("settings.closeToTrayHint")}
                  </span>
                </div>
              </label>
            </div>

            {/* Save & Reset Bar */}
            <div className="pt-4 border-t border-zinc-800 space-y-3">
              <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                <span className="flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <span>{t("settings.restartHint")}</span>
                </span>
                {hasUnsavedChanges && !saved && (
                  <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono text-[10px] rounded-[2px] shrink-0">
                    {t("settings.unsavedChanges")}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  form="settings-config-form"
                  className="flex-1 flex items-center justify-center space-x-2 px-5 py-2.5 bg-white hover:bg-zinc-200 text-black rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold shadow-[0_0_15px_rgba(255,255,255,0.15)] transition"
                >
                  <Save className="w-4 h-4" />
                  <span>{saved ? t("settings.savedSuccess") : t("settings.saveChanges")}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetDefaults}
                  className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-[2px] text-xs font-medium transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{t("settings.resetDefaults")}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 4: Master Password Management (Independent Form) */}
          <form
            onSubmit={handleChangeMasterPassword}
            className="p-6 bg-[#0A0A0C] border border-white/10 rounded-[2px] space-y-4"
          >
            <div className="flex items-center space-x-2 pb-3 border-b border-zinc-800 text-xs font-bold text-white uppercase tracking-wider font-mono">
              <KeyRound className="w-4 h-4 text-white" />
              <span>{t("settings.masterPasswordSection")}</span>
            </div>
            <p className="text-[11px] text-zinc-400">
              {t("settings.masterPasswordDesc")}
            </p>

            {masterPassError && (
              <div className="p-2.5 bg-white/5 border border-white/20 rounded-[2px] text-xs font-mono text-zinc-200">
                {masterPassError}
              </div>
            )}
            {masterPassSuccess && (
              <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-[2px] text-xs font-mono text-emerald-300 flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{t("settings.masterPassSuccess")}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.newMasterPassword")}
                </label>
                <input
                  type="password"
                  value={newMasterPass}
                  onChange={(e) => setNewMasterPass(e.target.value)}
                  placeholder="••••••••"
                  className={inputBaseClass}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-zinc-400 block mb-1.5">
                  {t("settings.confirmNewMasterPassword")}
                </label>
                <input
                  type="password"
                  value={confirmMasterPass}
                  onChange={(e) => setConfirmMasterPass(e.target.value)}
                  placeholder="••••••••"
                  className={inputBaseClass}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={changingMasterPass}
              className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-white/20 text-white rounded-[2px] text-xs font-mono uppercase tracking-wider font-bold transition disabled:opacity-50"
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>{changingMasterPass ? t("common.loading") : t("settings.updateMasterPassBtn")}</span>
            </button>
          </form>

          {/* Card 5: Danger Zone: Clean Chaindata */}
          <div className="p-6 bg-red-950/10 border border-red-900/40 rounded-[2px] space-y-3">
            <div className="flex items-center space-x-2 text-xs font-bold text-red-400 uppercase tracking-wider font-mono">
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
                <div className="flex flex-wrap items-center gap-3">
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
    </div>
  );
};
