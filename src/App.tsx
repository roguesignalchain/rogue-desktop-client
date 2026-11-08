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
import { Block, NodeStatus, SyncStatus } from "./types";
import { api } from "./services/api";
import { Loader2, ShieldAlert } from "lucide-react";

const DEFAULT_HTTP_PORT = 38849;
const DEFAULT_WS_PORT = 0; // Disabled by default to avoid port collision with local nodes
const DEFAULT_P2P_PORT = 38890;
const DEFAULT_DATADIR = "./nodes-local/node-desktop";
const DEFAULT_BOOTNODES =
  "enode://3bfcd978ea35fc817c5573b03e7b76cb7367720d4ff7a1fdb7ddcb83ec2ad6cba997029305678d49e1dbfccc83a20ecea0d4920a483a8e4d86ebe212b06bcefc@127.0.0.1:38888";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabType>("dashboard");
  const [rpcUrl, setRpcUrl] = useState<string>(() => {
    return localStorage.getItem("rogue_rpc_url") || `http://127.0.0.1:${DEFAULT_HTTP_PORT}`;
  });
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_auto_lock");
    return saved ? parseInt(saved, 10) : 15;
  });

  // Dedicated Desktop Node configuration
  const [nodeHttpPort, setNodeHttpPort] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_node_http_port");
    return saved ? parseInt(saved, 10) : DEFAULT_HTTP_PORT;
  });
  const [nodeWsPort, setNodeWsPort] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_node_ws_port");
    return saved ? parseInt(saved, 10) : DEFAULT_WS_PORT;
  });
  const [nodeP2pPort, setNodeP2pPort] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_node_p2p_port");
    return saved ? parseInt(saved, 10) : DEFAULT_P2P_PORT;
  });
  const [nodeDatadir, setNodeDatadir] = useState<string>(() => {
    return localStorage.getItem("rogue_node_datadir") || DEFAULT_DATADIR;
  });
  const [nodeBootnodes, setNodeBootnodes] = useState<string>(() => {
    return localStorage.getItem("rogue_node_bootnodes") || DEFAULT_BOOTNODES;
  });
  const [nodeCache, setNodeCache] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_node_cache");
    return saved ? parseInt(saved, 10) : 256;
  });
  const [nodeSyncmode, setNodeSyncmode] = useState<"full" | "snap">(() => {
    return (localStorage.getItem("rogue_node_syncmode") as "full" | "snap") || "full";
  });
  const [nodeVerbosity, setNodeVerbosity] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_node_verbosity");
    return saved ? parseInt(saved, 10) : 3;
  });

  const [nodeStatus, setNodeStatus] = useState<NodeStatus>({ running: false, pid: null });
  const [rpcConnected, setRpcConnected] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isSyncing: false,
    startingBlock: 0,
    currentBlock: 0,
    highestBlock: 0,
    progressPercentage: 100,
  });
  const [currentBlock, setCurrentBlock] = useState<number>(0);
  const [balance, setBalance] = useState<string>("0.0000");
  const [hashrate, setHashrate] = useState<number>(0);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [recentBlocks, setRecentBlocks] = useState<Block[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [unlockedAddress, setUnlockedAddress] = useState<string | null>(null);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [loadingBlocks, setLoadingBlocks] = useState<boolean>(false);
  const [isShuttingDown, setIsShuttingDown] = useState<boolean>(false);

  const lastActivityRef = useRef<number>(Date.now());
  const autoStartInitiated = useRef<boolean>(false);

  // Listen to Tauri log events (clean async unlisten to avoid duplicates)
  useEffect(() => {
    let isCancelled = false;
    let cleanups: (() => void)[] = [];

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (isCancelled) return;

        const unlistenNode = await listen<string>("node-log", (event) => {
          setLogs((prev) => [...prev.slice(-300), `[Geth] ${event.payload}`]);
        });
        if (isCancelled) {
          unlistenNode();
        } else {
          cleanups.push(unlistenNode);
        }

        const unlistenStratum = await listen<string>("stratum-log", (event) => {
          setLogs((prev) => [...prev.slice(-300), `[Stratum] ${event.payload}`]);
        });
        if (isCancelled) {
          unlistenStratum();
        } else {
          cleanups.push(unlistenStratum);
        }
      } catch (err) {
        // Outside of Tauri context or mocking
      }
    }

    setupListeners();
    return () => {
      isCancelled = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  // Intercept window close to gracefully stop node
  useEffect(() => {
    let unlistenClose: (() => void) | undefined;
    async function setupCloseHandler() {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWindow = getCurrentWindow();
        unlistenClose = await appWindow.onCloseRequested(async (event) => {
          event.preventDefault();
          setIsShuttingDown(true);
          try {
            await api.stopNode();
          } catch (e) {
            console.error("Error shutting down node cleanly:", e);
          }
          await appWindow.destroy();
        });
      } catch (err) {
        // Outside of Tauri context
      }
    }
    setupCloseHandler();
    return () => {
      if (unlistenClose) unlistenClose();
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

  // Periodic polling for node metrics & sync status
  const refreshMetrics = async () => {
    try {
      const status = await api.getNodeStatus();
      setNodeStatus(status);

      const blockNum = await api.getBlockNumber(rpcUrl);
      setCurrentBlock(blockNum);

      const peers = await api.getPeerCount(rpcUrl);
      setPeerCount(peers);

      const sync = await api.getSyncStatus(rpcUrl);
      setSyncStatus(sync);

      const hr = await api.getHashrate(rpcUrl);
      setHashrate(hr);

      if (unlockedAddress) {
        const bal = await api.getBalance(rpcUrl, unlockedAddress);
        setBalance(bal);
      }

      setRpcConnected(true);
    } catch {
      // Node may be offline, starting up, or RPC endpoint not responding
      setRpcConnected(false);
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

  // Adaptive polling: 2s during active sync or waiting for peers, 4s once synced
  useEffect(() => {
    refreshMetrics();
    refreshBlocks();

    const pollIntervalMs = syncStatus.isSyncing || peerCount === 0 || !rpcConnected ? 2000 : 4000;
    const interval = setInterval(() => {
      refreshMetrics();
      refreshBlocks();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [rpcUrl, unlockedAddress, syncStatus.isSyncing, peerCount, rpcConnected]);

  const handleStartNode = async (mine: boolean = false, threads: number = 2, coinbase?: string) => {
    try {
      const msg = await api.startNode({
        datadir: nodeDatadir,
        http_port: nodeHttpPort,
        ws_port: nodeWsPort,
        p2p_port: nodeP2pPort,
        bootnodes: nodeBootnodes,
        mine,
        miner_threads: threads,
        fast_mode: false,
        coinbase: coinbase || unlockedAddress || undefined,
        cache: nodeCache,
        syncmode: nodeSyncmode,
        verbosity: nodeVerbosity,
      });
      setLogs((prev) => [...prev, `[Manager] ${msg}`]);
      const activeRpc = `http://127.0.0.1:${nodeHttpPort}`;
      setRpcUrl(activeRpc);
      localStorage.setItem("rogue_rpc_url", activeRpc);
      refreshMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setLogs((prev) => [...prev, `[Manager Error] ${msg}`]);
      throw err;
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

  // Auto-start node upon application mount with retry backoff (guarded against strict mode)
  useEffect(() => {
    if (autoStartInitiated.current) return;
    autoStartInitiated.current = true;

    let attempts = 0;
    let isCancelled = false;

    const tryAutoStart = async () => {
      try {
        await handleStartNode(false);
      } catch (err) {
        if (!isCancelled && attempts < 3) {
          attempts++;
          const delay = Math.pow(2, attempts) * 1000;
          setLogs((prev) => [
            ...prev,
            `[Auto-Start] Retry attempt ${attempts}/3 in ${delay / 1000}s...`,
          ]);
          setTimeout(tryAutoStart, delay);
        }
      }
    };

    tryAutoStart();
    return () => {
      isCancelled = true;
    };
  }, []);

  const handleRetryPeers = async () => {
    if (!nodeBootnodes) return;
    const enodes = nodeBootnodes.split(",").map((e) => e.trim()).filter(Boolean);
    for (const enode of enodes) {
      try {
        await api.addPeer(rpcUrl, enode);
        setLogs((prev) => [...prev, `[P2P] Added peer/bootnode: ${enode}`]);
      } catch (err) {
        console.warn("Failed to add peer:", err);
      }
    }
    refreshMetrics();
  };

  const handleCleanChaindata = async (customDatadir?: string) => {
    const targetDir = customDatadir || nodeDatadir;
    setLogs((prev) => [...prev, `[Maintenance] Wiping chaindata at ${targetDir}...`]);
    const res = await api.cleanChaindata(targetDir);
    setLogs((prev) => [...prev, `[Maintenance] ${res}`]);
    await handleStartNode(false);
  };

  const handleSaveNodeConfig = (config: {
    datadir: string;
    httpPort: number;
    wsPort: number;
    p2pPort: number;
    bootnodes: string;
    cache: number;
    syncmode: "full" | "snap";
    verbosity: number;
  }) => {
    setNodeDatadir(config.datadir);
    setNodeHttpPort(config.httpPort);
    setNodeWsPort(config.wsPort);
    setNodeP2pPort(config.p2pPort);
    setNodeBootnodes(config.bootnodes);
    setNodeCache(config.cache);
    setNodeSyncmode(config.syncmode);
    setNodeVerbosity(config.verbosity);

    localStorage.setItem("rogue_node_datadir", config.datadir);
    localStorage.setItem("rogue_node_http_port", config.httpPort.toString());
    localStorage.setItem("rogue_node_ws_port", config.wsPort.toString());
    localStorage.setItem("rogue_node_p2p_port", config.p2pPort.toString());
    localStorage.setItem("rogue_node_bootnodes", config.bootnodes);
    localStorage.setItem("rogue_node_cache", config.cache.toString());
    localStorage.setItem("rogue_node_syncmode", config.syncmode);
    localStorage.setItem("rogue_node_verbosity", config.verbosity.toString());
  };

  const handleSaveRpcUrl = (url: string) => {
    setRpcUrl(url);
    localStorage.setItem("rogue_rpc_url", url);
  };

  const handleSaveAutoLock = (mins: number) => {
    setAutoLockMinutes(mins);
    localStorage.setItem("rogue_auto_lock", mins.toString());
  };

  return (
    <div className="flex flex-col h-screen bg-[#08090c] text-slate-100 overflow-hidden relative">
      <Navbar
        nodeStatus={nodeStatus}
        syncStatus={syncStatus}
        rpcConnected={rpcConnected}
        peerCount={peerCount}
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
              syncStatus={syncStatus}
              rpcConnected={rpcConnected}
              recentBlocks={recentBlocks}
              onNavigate={(tab) => setCurrentTab(tab)}
              onRetryPeers={handleRetryPeers}
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
              nodeStatus={nodeStatus}
              syncStatus={syncStatus}
              peerCount={peerCount}
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
              onSaveRpcUrl={handleSaveRpcUrl}
              autoLockMinutes={autoLockMinutes}
              onSaveAutoLockMinutes={handleSaveAutoLock}
              nodeDatadir={nodeDatadir}
              nodeHttpPort={nodeHttpPort}
              nodeWsPort={nodeWsPort}
              nodeP2pPort={nodeP2pPort}
              nodeBootnodes={nodeBootnodes}
              nodeCache={nodeCache}
              nodeSyncmode={nodeSyncmode}
              nodeVerbosity={nodeVerbosity}
              nodeStatus={nodeStatus}
              onStartNode={() => handleStartNode(false)}
              onStopNode={handleStopNode}
              onCleanChaindata={handleCleanChaindata}
              onSaveNodeConfig={handleSaveNodeConfig}
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

      {/* Graceful Shutdown Modal Overlay */}
      {isShuttingDown && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-rose-950/60 border border-rose-600/40 flex items-center justify-center mb-6 shadow-[0_0_24px_rgba(244,63,94,0.3)]">
            <Loader2 className="w-8 h-8 text-rose-500 animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">
            Cerrando el nodo y guardando la base de datos...
          </h2>
          <p className="text-sm text-zinc-400 max-w-md mt-2">
            Core-Geth está sincronizando el estado de LevelDB a disco de forma segura. Por favor no desconectes el equipo para evitar la corrupción de la blockchain.
          </p>
          <div className="mt-6 flex items-center space-x-2 text-xs font-mono text-amber-400 bg-amber-950/40 border border-amber-800/50 px-3 py-1.5 rounded-full">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Apagado ordenado en curso</span>
          </div>
        </div>
      )}
    </div>
  );
};
