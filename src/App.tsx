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
import { Block, NodeStatus, SyncStatus, WalletSummary, AccountInfo } from "./types";
import { api } from "./services/api";
import { Loader2, ShieldAlert, AlertTriangle } from "lucide-react";

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
    return "full";
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
  const [allWallets, setAllWallets] = useState<WalletSummary[]>([]);
  const [activeWallet, setActiveWallet] = useState<WalletSummary | null>(null);
  const [derivedAccounts, setDerivedAccounts] = useState<AccountInfo[]>([]);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState<boolean>(false);
  const [walletModalMode, setWalletModalMode] = useState<"unlock" | "create" | "import">("unlock");
  const [pendingWalletSwitchId, setPendingWalletSwitchId] = useState<string | null>(null);
  const [showMiningSwitchConfirm, setShowMiningSwitchConfirm] = useState<boolean>(false);
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
            await api.exitApp();
          } catch (e) {
            console.error("Error calling exitApp:", e);
            try {
              await appWindow.destroy();
            } catch {
              // ignore
            }
          }
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

  const loadActiveWalletAccounts = async (walletId: string) => {
    try {
      const accs = await api.getDerivedAccounts(walletId);
      setDerivedAccounts(accs);
    } catch (e) {
      console.warn("Could not load derived accounts:", e);
    }
  };

  const handleLockWallet = async () => {
    try {
      await api.lockWallet();
    } catch (e) {
      console.warn("Failed to lock wallet backend:", e);
    }
    setUnlockedAddress(null);
    setActiveWallet(null);
    setAllWallets([]);
    setDerivedAccounts([]);
    setLogs((prev) => [...prev, "[Wallet] Bóveda bloqueada exitosamente."]);
  };

  const handleWalletUnlocked = async (actWallet: WalletSummary, walletsList: WalletSummary[]) => {
    setAllWallets(walletsList);
    const savedActiveId = localStorage.getItem("rogue_active_wallet_id");
    const found = walletsList.find((w) => w.id === savedActiveId) || actWallet;
    setActiveWallet(found);
    setUnlockedAddress(found.primary_address);
    await loadActiveWalletAccounts(found.id);
    setLogs((prev) => [...prev, `[Wallet] Bóveda desbloqueada: ${found.name} (${found.primary_address})`]);
  };

  const handleSwitchWalletRequest = async (walletId: string) => {
    if (activeWallet?.id === walletId) return;

    if (hashrate > 0) {
      setPendingWalletSwitchId(walletId);
      setShowMiningSwitchConfirm(true);
      return;
    }

    await executeWalletSwitch(walletId);
  };

  const executeWalletSwitch = async (walletId: string, stopMining: boolean = false) => {
    try {
      if (stopMining) {
        await handleStopNode();
        setLogs((prev) => [...prev, "[Mining] Minería detenida automáticamente al cambiar de billetera activa."]);
      }

      const summary = await api.setActiveWallet(walletId);
      setActiveWallet(summary);
      setUnlockedAddress(summary.primary_address);
      localStorage.setItem("rogue_active_wallet_id", walletId);
      await loadActiveWalletAccounts(walletId);
      setLogs((prev) => [...prev, `[Wallet] Billetera activa cambiada a: ${summary.name} (${summary.primary_address})`]);
    } catch (err) {
      console.error("Error switching wallet:", err);
    } finally {
      setShowMiningSwitchConfirm(false);
      setPendingWalletSwitchId(null);
    }
  };

  const handleRemoveWallet = async (walletId: string) => {
    try {
      const updated = await api.removeWallet(walletId);
      setAllWallets(updated);
      if (activeWallet?.id === walletId && updated.length > 0) {
        await executeWalletSwitch(updated[0].id);
      }
      setLogs((prev) => [...prev, "[Wallet] Billetera eliminada de la bóveda."]);
    } catch (err) {
      console.error("Error removing wallet:", err);
    }
  };

  const handleWalletRenamed = (walletId: string, newName: string) => {
    setAllWallets((prev) => prev.map((w) => (w.id === walletId ? { ...w, name: newName } : w)));
    if (activeWallet?.id === walletId) {
      setActiveWallet((prev) => (prev ? { ...prev, name: newName } : null));
    }
  };

  const handleSelectAddress = (addr: string) => {
    setUnlockedAddress(addr);
    setLogs((prev) => [...prev, `[Wallet] Dirección activa seleccionada: ${addr}`]);
  };

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
          handleLockWallet();
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

      // Primary connectivity check: if block number responds, RPC is connected
      const blockNum = await api.getBlockNumber(rpcUrl);
      setCurrentBlock(blockNum);
      setRpcConnected(true);

      // Secondary metrics are queried safely to prevent transient timeouts from dropping the connection
      try {
        const peers = await api.getPeerCount(rpcUrl);
        setPeerCount(peers);
      } catch {
        // Transient peer query failure
      }

      try {
        const sync = await api.getSyncStatus(rpcUrl, blockNum);
        setSyncStatus(sync);
      } catch {
        // Transient sync query failure
      }

      try {
        const hr = await api.getHashrate(rpcUrl);
        setHashrate(hr);
      } catch {
        // Transient hashrate query failure
      }

      if (unlockedAddress) {
        try {
          const bal = await api.getBalance(rpcUrl, unlockedAddress);
          setBalance(bal);
        } catch {
          // Transient balance query failure
        }
      }
    } catch {
      // Node is unreachable via RPC endpoint
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
        activeWallet={activeWallet}
        allWallets={allWallets}
        derivedAccounts={derivedAccounts}
        activeBalance={balance}
        onOpenWalletModal={(mode) => {
          setWalletModalMode(mode || "unlock");
          setIsWalletModalOpen(true);
        }}
        onLockWallet={handleLockWallet}
        onSelectWallet={handleSwitchWalletRequest}
        onSelectAddress={handleSelectAddress}
        onRemoveWallet={handleRemoveWallet}
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
              activeWallet={activeWallet}
              balance={balance}
              rpcUrl={rpcUrl}
              onRefreshBalance={refreshMetrics}
              onOpenWalletModal={(mode) => {
                setWalletModalMode(mode || "create");
                setIsWalletModalOpen(true);
              }}
              onSelectAddress={handleSelectAddress}
              onWalletRenamed={handleWalletRenamed}
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
        onWalletUnlocked={handleWalletUnlocked}
        initialMode={walletModalMode}
        isVaultUnlocked={!!unlockedAddress}
      />

      {/* Confirmation Modal when switching wallet while mining is active */}
      {showMiningSwitchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-zinc-950 border border-amber-800/80 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Minería RandomX en Ejecución</h3>
                <p className="text-xs text-amber-300">Cambio de billetera requiere pausar la minería</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              Actualmente estás minando bloques con la billetera activa anterior. Si cambias de billetera ahora, la minería local se detendrá automáticamente para evitar pagos a una dirección no deseada.
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowMiningSwitchConfirm(false);
                  setPendingWalletSwitchId(null);
                }}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (pendingWalletSwitchId) {
                    executeWalletSwitch(pendingWalletSwitchId, true);
                  }
                }}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow transition"
              >
                Detener Minería y Cambiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graceful Shutdown Modal Overlay */}
      {isShuttingDown && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
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
