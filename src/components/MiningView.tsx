import React, { useState, useEffect } from "react";
import { Pickaxe, Cpu, Download, Play, Square, Radio } from "lucide-react";
import { api } from "../services/api";

interface MiningViewProps {
  hashrate: number;
  rpcUrl: string;
  unlockedAddress: string | null;
}

export const MiningView: React.FC<MiningViewProps> = ({
  hashrate,
  rpcUrl,
  unlockedAddress,
}) => {
  const [threads, setThreads] = useState<number>(2);
  const [isMining, setIsMining] = useState<boolean>(false);
  const [fastMode, setFastMode] = useState<boolean>(false);
  const [stratumRunning, setStratumRunning] = useState<boolean>(false);
  const stratumPort = 3333;
  const [feedback, setFeedback] = useState<string | null>(null);

  // Synchronize mining status with node
  useEffect(() => {
    let mounted = true;
    const checkMining = async () => {
      try {
        const mining = await api.isMining(rpcUrl);
        if (mounted) {
          setIsMining(mining);
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

  const handleToggleMining = async () => {
    try {
      if (!isMining) {
        let payoutAddr = unlockedAddress;
        if (!payoutAddr) {
          const currentCoinbase = await api.getCoinbase(rpcUrl);
          if (currentCoinbase && currentCoinbase !== "0x0000000000000000000000000000000000000000") {
            payoutAddr = currentCoinbase;
          }
        }

        if (!payoutAddr) {
          setFeedback("⚠️ Please unlock a wallet first in the Wallet tab so mining rewards can be sent to your address.");
          return;
        }

        await api.startMining(rpcUrl, threads, payoutAddr);
        setIsMining(true);
        setFeedback(`Internal miner started with ${threads} CPU threads. Rewards destination: ${payoutAddr}`);
      } else {
        await api.stopMining(rpcUrl);
        setIsMining(false);
        setFeedback("Internal miner stopped successfully.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setFeedback(`Miner control error: ${msg}`);
    }
  };

  const handleToggleStratum = async () => {
    try {
      if (!stratumRunning) {
        const res = await api.startStratum(stratumPort, rpcUrl);
        setStratumRunning(true);
        setFeedback(`Stratum v1 bridge active on port :${stratumPort}. Ready for XMRig! (${res})`);
      } else {
        const res = await api.stopStratum();
        setStratumRunning(false);
        setFeedback(`Stratum bridge stopped: ${res}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : JSON.stringify(err);
      setFeedback(`Stratum error: ${msg}`);
    }
  };

  const handleDownloadXmrigConfig = () => {
    const address = unlockedAddress || "0xe9aaE535B7971A9AC8C6af0e4B524D02260D3a03";
    const xmrigConfig = {
      autosave: true,
      cpu: {
        enabled: true,
        "huge-pages": true,
        "hw-aes": null,
        priority: null,
        "memory-pool": false,
        "yield": true,
      },
      opencl: { enabled: false },
      cuda: { enabled: false },
      pools: [
        {
          algo: "rx/0",
          coin: null,
          url: `127.0.0.1:${stratumPort}`,
          user: address,
          pass: "x",
          rig_id: "rogue-worker-1",
          nicehash: false,
          keepalive: true,
          enabled: true,
          tls: false,
        },
      ],
      "retries": 5,
      "retry-pause": 5,
    };

    const blob = new Blob([JSON.stringify(xmrigConfig, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "config.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center space-x-2">
            <Pickaxe className="w-5 h-5 text-rose-500" />
            <span>RandomX (rx/0) Mining Center</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Mine natively with your CPU using Core-Geth's internal sealer or connect external miners (XMRig) via the Stratum v1 bridge.
          </p>
        </div>

        <div className="text-right font-mono">
          <span className="text-xs text-zinc-400 uppercase tracking-wider block">Estimated Hashrate</span>
          <span className="text-2xl font-black text-rose-400">
            {hashrate > 0 ? `${(hashrate / 1000).toFixed(2)} kH/s` : "0.00 H/s"}
          </span>
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-300 rounded-lg">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Internal CPU Miner Card */}
        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-rose-500" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Internal CPU Miner</h2>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono ${
                isMining ? "bg-emerald-950 text-emerald-300 border border-emerald-800" : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {isMining ? "MINING ACTIVE" : "IDLE"}
            </span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">
                <span>CPU Mining Threads</span>
                <span className="text-white font-mono">{threads} Cores</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                value={threads}
                onChange={(e) => setThreads(parseInt(e.target.value))}
                className="w-full accent-rose-500 cursor-pointer"
              />
            </div>

            <div className="p-3 bg-zinc-950/60 rounded-lg border border-zinc-800/80 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Dataset Mode</div>
                <div className="text-[11px] text-zinc-400">
                  {fastMode ? "Fast Mode (~2.1 GB RAM required)" : "Light Mode (~256 MB RAM)"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFastMode(!fastMode)}
                className={`px-3 py-1 text-xs font-mono rounded border transition ${
                  fastMode
                    ? "bg-rose-500/20 border-rose-500 text-rose-300"
                    : "bg-zinc-900 border-zinc-700 text-zinc-400"
                }`}
              >
                {fastMode ? "Fast (2GB)" : "Light (256MB)"}
              </button>
            </div>

            <button
              onClick={handleToggleMining}
              className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-semibold transition ${
                isMining
                  ? "bg-red-900/80 hover:bg-red-800 border border-red-700 text-white"
                  : "bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950"
              }`}
            >
              {isMining ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
              <span>{isMining ? "Stop Internal Miner" : "Start Internal Miner"}</span>
            </button>
          </div>
        </div>

        {/* Stratum Bridge & XMRig Card */}
        <div className="p-6 bg-zinc-900/40 border border-zinc-800 rounded-xl space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <div className="flex items-center space-x-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Stratum v1 Bridge</h2>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded font-mono ${
                stratumRunning
                  ? "bg-cyan-950 text-cyan-300 border border-cyan-800"
                  : "bg-zinc-800 text-zinc-400"
              }`}
            >
              {stratumRunning ? "PORT :3333 ACTIVE" : "STOPPED"}
            </span>
          </div>

          <p className="text-xs text-zinc-400">
            The bridge exposes a standard Monero Stratum v1 TCP server, allowing any official XMRig client to mine Rogue Signal blocks without modifications.
          </p>

          <div className="space-y-3">
            <button
              onClick={handleToggleStratum}
              className={`w-full flex items-center justify-center space-x-2 py-2.5 rounded-lg text-sm font-semibold transition ${
                stratumRunning
                  ? "bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-700 text-cyan-200"
                  : "bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-white"
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>{stratumRunning ? "Stop Stratum Bridge" : "Launch Stratum Bridge"}</span>
            </button>

            <button
              onClick={handleDownloadXmrigConfig}
              className="w-full flex items-center justify-center space-x-2 py-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 rounded-lg text-xs font-mono transition"
            >
              <Download className="w-4 h-4 text-rose-400" />
              <span>Export XMRig `config.json`</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
