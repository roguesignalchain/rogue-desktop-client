import React, { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

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
        t("mining.feedback.diagnosticDone", {
          cores: res.cpuCores,
          ram: (res.availableRamMb / 1024).toFixed(1),
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setFeedback(t("mining.feedback.diagnosticError", { msg }));
    } finally {
      setCheckingSpecs(false);
    }
  };

  const applyRecommendedSpecs = () => {
    if (!specs) return;
    setThreads(specs.recommendedThreads);
    setFastMode(false); // Always default to Light Mode for safety
    setFeedback(
      t("mining.feedback.recommendedApplied", { threads: specs.recommendedThreads })
    );
  };

  const maxCores = specs?.cpuCores || 16;

  const selectProfile = (ratio: number, label: string) => {
    const calculated = Math.max(1, Math.round(maxCores * ratio));
    setThreads(calculated);
    setFeedback(
      t("mining.feedback.profileSelected", { label, calculated, maxCores })
    );
  };

  const handleModeChange = async (useFast: boolean) => {
    if (useFast && specs && !specs.canRunFastMode) {
      setFeedback(t("mining.feedback.lowRamWarning"));
    }
    setFastMode(useFast);
    if (isMining) {
      await api.setFastMode(rpcUrl, useFast);
      setFeedback(
        t("mining.feedback.modeUpdated", {
          mode: useFast ? "Fast Mode (~2.08 GB RAM)" : "Light Mode (~256 MB RAM)",
        })
      );
    }
  };

  const handleToggleMining = async () => {
    try {
      if (!isMining) {
        if (!isNetworkSynced) {
          setFeedback(t("mining.feedback.cannotStartNotSynced"));
          return;
        }

        let payoutAddr = unlockedAddress || coinbaseAddr;
        if (!payoutAddr) {
          setFeedback(t("mining.feedback.unlockWalletFirst"));
          return;
        }

        await api.startMining(rpcUrl, threads, payoutAddr, fastMode);
        setIsMining(true);
        setCoinbaseAddr(payoutAddr);
        setFeedback(
          t("mining.feedback.miningStarted", {
            threads,
            mode: fastMode ? "Fast Mode 2GB" : "Light Mode 256MB",
            address: payoutAddr,
          })
        );
      } else {
        await api.stopMining(rpcUrl);
        setIsMining(false);
        setFeedback(t("mining.feedback.miningStopped"));
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setFeedback(t("mining.feedback.controlError", { msg }));
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
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-1">
            {t("mining.consensusEngine")}
          </div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2 font-display">
            <Pickaxe className="w-5 h-5 text-white" />
            <span>{t("mining.title")}</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1 font-sans">
            {t("mining.description")}
          </p>
        </div>

        <div className="flex items-center space-x-6">
          <div className="text-right font-mono">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              {t("mining.myMinedBlocks")}
            </span>
            <span className="text-xl font-black text-white flex items-center justify-end space-x-1">
              <Award className="w-4 h-4 text-white" />
              <span>{minedByMeCount}</span>
            </span>
          </div>

          <div className="h-8 w-px bg-white/10" />

          <div className="text-right font-mono">
            <span className="text-[10px] text-zinc-400 uppercase tracking-wider block">
              {t("mining.localHashrate")}
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
                {t("mining.syncedTitle")}
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                {t("mining.syncedDesc", {
                  count: peerCount,
                  peers: peerCount === 1 ? t("mining.peerSingle") : t("mining.peerPlural"),
                })}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-white px-2.5 py-1 bg-white/10 rounded-[2px] border border-white/30 font-bold">
            {t("sync.synced")}
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
                  ? t("mining.searchingPeers")
                  : t("mining.syncingChain", { progress: syncStatus?.progressPercentage || 0 })}
              </h2>
              <p className="text-[11px] text-zinc-400 mt-0.5 font-sans">
                {t("mining.syncPendingDesc")}
              </p>
            </div>
          </div>
          <span className="text-xs font-mono text-zinc-400 px-2.5 py-1 bg-zinc-900 rounded-[2px] border border-white/10">
            {t("mining.syncPendingBadge")}
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
            {t("common.close")}
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
                  {t("mining.controlTitle")}
                </h2>
              </div>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-[2px] font-mono ${
                  isMining
                    ? "bg-white text-black font-bold"
                    : "bg-black text-zinc-500 border border-white/10"
                }`}
              >
                {isMining ? t("mining.miningSoloBadge") : t("mining.stoppedBadge")}
              </span>
            </div>

            {/* Active Reward Address (Etherbase) */}
            <div className="p-3 bg-black rounded-[2px] border border-white/10 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span className="flex items-center space-x-1.5 font-semibold uppercase tracking-wider font-mono">
                  <Wallet className="w-3.5 h-3.5 text-white" />
                  <span>{t("mining.rewardAddress")}</span>
                </span>
                <span className="text-white font-mono text-[10px]">[AUTOSYNC]</span>
              </div>
              <div className="font-mono text-xs text-zinc-200 truncate">
                {activeRewardAddress || t("mining.unlockToAssign")}
              </div>
            </div>

            {/* CPU Thread Profiles */}
            <div className="space-y-2.5">
              <div className="flex justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                <span>{t("mining.threadProfiles")}</span>
                <span className="text-white font-mono font-bold">
                  {t("mining.threadsInfo", {
                    threads,
                    maxCores,
                    pct: Math.round((threads / maxCores) * 100),
                  })}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => selectProfile(0.25, "25%")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.25))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">{t("mining.threads25")}</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    {t("mining.threadsCount", {
                      threads: Math.max(1, Math.round(maxCores * 0.25)),
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.5, "50%")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads === Math.max(1, Math.round(maxCores * 0.5))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">{t("mining.threads50")}</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    {t("mining.threadsCount", {
                      threads: Math.max(1, Math.round(maxCores * 0.5)),
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => selectProfile(0.75, "75%")}
                  className={`py-2 px-2 rounded-[2px] border text-xs font-mono transition flex flex-col items-center ${
                    threads >= Math.max(1, Math.round(maxCores * 0.75))
                      ? "bg-white text-black font-bold border-white"
                      : "bg-black border-white/10 text-zinc-400 hover:border-white/30 hover:text-white"
                  }`}
                >
                  <span className="font-bold">{t("mining.threads75")}</span>
                  <span className="text-[10px] opacity-80 font-mono">
                    {t("mining.threadsCount", {
                      threads: Math.max(1, Math.round(maxCores * 0.75)),
                    })}
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
                  <span>{t("mining.oneThread")}</span>
                  <span>{t("mining.manualTuning")}</span>
                  <span>{t("mining.maxThreads", { maxCores })}</span>
                </div>
              </div>
            </div>

            {/* RandomX Memory Mode Selector */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-wider font-mono">
                {t("mining.memoryMode")}
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
                    {t("mining.lightModeDesc")}
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
                    {t("mining.fastModeDesc")}
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
                  <span>{t("mining.stopMiningBtn")}</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {!isNetworkSynced ? t("mining.waitingSyncBtn") : t("mining.startMiningBtn")}
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
                  {t("mining.systemResources")}
                </h2>
              </div>
              <button
                type="button"
                onClick={handleCheckSystemResources}
                disabled={checkingSpecs}
                className="flex items-center space-x-1.5 px-3 py-1 bg-black hover:bg-white/10 border border-white/20 text-white rounded-[2px] text-xs font-mono font-semibold transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingSpecs ? "animate-spin" : ""}`} />
                <span>{checkingSpecs ? t("mining.analyzing") : t("mining.verifyResources")}</span>
              </button>
            </div>

            <p className="text-xs text-zinc-400 font-sans">
              {t("mining.resourcesDesc")}
            </p>

            {specs ? (
              <div className="space-y-3 font-mono">
                {/* CPU Info Box */}
                <div className="p-3.5 bg-black border border-white/10 rounded-[2px] space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <Cpu className="w-3.5 h-3.5 text-white" />
                      <span>{t("mining.detectedCpu")}</span>
                    </span>
                    <span className="text-white font-bold">
                      {t("mining.logicalCores", { cores: specs.cpuCores })}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-300 truncate">{specs.cpuModel}</div>
                </div>

                {/* RAM Info Box */}
                <div className="p-3.5 bg-black border border-white/10 rounded-[2px] space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-400 font-semibold flex items-center space-x-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-white" />
                      <span>{t("mining.systemRam")}</span>
                    </span>
                    <span className="text-white font-bold">
                      {t("mining.ramStats", {
                        free: (specs.availableRamMb / 1024).toFixed(1),
                        total: (specs.totalRamMb / 1024).toFixed(1),
                      })}
                    </span>
                  </div>

                  <div className="w-full h-1.5 bg-zinc-900 rounded-[1px] overflow-hidden border border-white/10">
                    <div
                      className="h-full bg-white transition-all duration-300"
                      style={{ width: `${ramUsagePercent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500">
                    <span>{t("mining.ramInUse", { pct: ramUsagePercent })}</span>
                    <span>{t("mining.ramAvailable", { mb: specs.availableRamMb })}</span>
                  </div>
                </div>

                {/* Safe Recommendation Box */}
                <div className="p-3.5 bg-white/5 border border-white/15 rounded-[2px] space-y-2">
                  <div className="flex items-center space-x-2 text-xs font-bold text-white">
                    <ShieldCheck className="w-4 h-4 text-white shrink-0" />
                    <span>{t("mining.safeRecommendation")}</span>
                  </div>
                  <ul className="text-[11px] text-zinc-300 space-y-1 pl-4 list-disc font-sans">
                    <li>
                      <strong>{t("mining.recommendedThreadsLabel")}</strong>{" "}
                      <span className="font-mono text-white font-bold">
                        {t("mining.threadsCount", { threads: specs.recommendedThreads })}
                      </span>{" "}
                      {t("mining.recommendedThreadsHint")}
                    </li>
                    <li>
                      <strong>{t("mining.defaultModeLabel")}</strong>{" "}
                      <span className="font-mono text-white">Light Mode (~256 MB)</span> {t("mining.forStability")}
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-zinc-500 text-xs font-mono">
                {t("mining.clickToVerify")}
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
              <span>{t("mining.applySafeConfig", { threads: specs?.recommendedThreads || 2 })}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
