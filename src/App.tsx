import React, { useState, useEffect, useRef } from "react";
import { Navbar } from "./components/Navbar";
import { Sidebar, TabType } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { WalletView } from "./components/WalletView";
import { MiningView } from "./components/MiningView";
import { ExplorerView } from "./components/ExplorerView";
import { NodeConsoleView } from "./components/NodeConsoleView";
import { SettingsView } from "./components/SettingsView";
import { WalletModal } from "./components/WalletModal";
import { Block, NodeStatus } from "./types";
import { api } from "./services/api";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>("dashboard");
  const [rpcUrl, setRpcUrl] = useState<string>("http://127.0.0.1:38845");
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(15);
  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({ running: false, pid: null });
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [balance, setBalance] = useState<string>("0.0000");
  const [hashrate, setHashrate] = useState<number>(0);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [unlockedAddress, setUnlockedAddress] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [loadingBlocks, setLoadingBlocks] = useState<boolean>(false);

  const lastActivityRef = useRef<number>(Date.now());

  // Listen to Tauri log events
  useEffect(() => {
    let unlistenNode: (() => void) | undefined;
    let unlistenStratum: (() => void) | undefined;

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistenNode = await listen<string>("node-log", (event) => {
          setLogs((prev) => [...prev.slice(-300), `[Geth] ${event.payload}`]);
        });
        unlistenStratum = await listen<string>("stratum-log", (event) => {
          setLogs((prev) => [...prev.slice(-300), `[Stratum] ${event.payload}`]);
        });
      } catch (err) {
        // Outside of Tauri context or mocking
      }
    }

    setupListeners();
    return () => {
      if (unlistenNode) unlistenNode();
      if (unlistenStratum) unlistenStratum();
    };
  }, []);

  // Inactivity auto-lock listener
  useEffect(() => {
    const handleActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener("mousemove", handleActivity);
    window.addEventListener("keydown", handleActivity);

    const interval = setInterval(() => {
      if (autoLockMinutes > 0 && unlockedAddress) {
        const elapsed = (Date.now() - lastActivityRef.current) / 1000 / 60;
        if (elapsed >= autoLockMinutes) {
          setUnlockedAddress(null);
          setLogs((prev) => [...prev, "[Security] Wallet automatically locked due to inactivity."]);
        }
      }
    }, 15000);

    return () => {
      window.removeEventListener("mousemove", handleActivity);
      window.removeEventListener("keydown", handleActivity);
      clearInterval(interval);
    };
  }, [autoLockMinutes, unlockedAddress]);

  // Periodic polling for node metrics
  const refreshMetrics = async () => {
    try {
      const status = await api.getNodeStatus();
      setNodeStatus(status);

      const blockNum = await api.getBlockNumber(rpcUrl);
      setCurrentBlock(blockNum);

      const peers = await api.getPeerCount(rpcUrl);
      setPeerCount(peers);

      const hr = await api.getHashrate(rpcUrl);
      setHashrate(hr);

      if (unlockedAddress) {
        const bal = await api.getBalance(rpcUrl, unlockedAddress);
        setBalance(bal);
      }
    } catch {
      // Node may be offline
    }
  };

  const refreshBlocks = async () => {
    try {
      setLoadingBlocks(true);
      const blocks = await api.getRecentBlocks(rpcUrl, 8);
      setRecentBlocks(blocks);
    } catch {
      // Failed to fetch blocks
    } finally {
      setLoadingBlocks(false);
    }
  };

  useEffect(() => {
    refreshMetrics();
    refreshBlocks();
    const interval = setInterval(() => {
      refreshMetrics();
      refreshBlocks();
    }, 5000);
    return () => clearInterval(interval);
  }, [rpcUrl, unlockedAddress]);

  const handleStartNode = async () => {
    try {
      const msg = await api.startNode({
        http_port: 38845,
        ws_port: 38846,
        p2p_port: 38888,
        mine: false,
        miner_threads: 2,
        fast_mode: false,
        coinbase: unlockedAddress || undefined,
      });
      setLogs((prev) => [...prev, `[Manager] ${msg}`]);
      refreshMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev, `[Manager Error] ${msg}`]);
    }
  };

  const handleStopNode = async () => {
    try {
      const msg = await api.stopNode();
      setLogs((prev) => [...prev, `[Manager] ${msg}`]);
      refreshMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev, `[Manager Error] ${msg}`]);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#08090c] text-slate-100 overflow-hidden">
      <Navbar
        nodeStatus={nodeStatus}
        currentBlock={currentBlock}
        unlockedAddress={unlockedAddress}
        onOpenWalletModal={() => setIsWalletModalOpen(true)}
        onLockWallet={() => setUnlockedAddress(null)}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        <main className="flex-1 overflow-y-auto p-6">
          {currentTab === "dashboard" && (
            <Dashboard
              balance={balance}
              currentBlock={currentBlock}
              hashrate={hashrate}
              peerCount={peerCount}
              nodeStatus={nodeStatus}
              recentBlocks={recentBlocks}
              onStartNode={handleStartNode}
              onStopNode={handleStopNode}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === "wallet" && (
            <WalletView
              unlockedAddress={unlockedAddress}
              balance={balance}
              rpcUrl={rpcUrl}
              onRefreshBalance={refreshMetrics}
              onOpenWalletModal={() => setIsWalletModalOpen(true)}
            />
          )}

          {currentTab === "mining" && (
            <MiningView
              hashrate={hashrate}
              rpcUrl={rpcUrl}
              unlockedAddress={unlockedAddress}
            />
          )}

          {currentTab === "explorer" && (
            <ExplorerView
              blocks={recentBlocks}
              onRefresh={refreshBlocks}
              loading={loadingBlocks}
            />
          )}

          {currentTab === "console" && (
            <NodeConsoleView
              logs={logs}
              onClearLogs={() => setLogs([])}
              rpcUrl={rpcUrl}
            />
          )}

          {currentTab === "settings" && (
            <SettingsView
              rpcUrl={rpcUrl}
              onSaveRpcUrl={setRpcUrl}
              autoLockMinutes={autoLockMinutes}
              onSaveAutoLockMinutes={setAutoLockMinutes}
            />
          )}
        </main>
      </div>

      <WalletModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        onWalletUnlocked={(addr) => {
          setUnlockedAddress(addr);
          setLogs((prev) => [...prev, `[Wallet] Vault unlocked: ${addr}`]);
        }}
      />
    </div>
  );
};

