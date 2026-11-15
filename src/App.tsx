import React, { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Navbar } from "./components/Navbar";
import { Sidebar, TabType } from "./components/Sidebar";
import { Dashboard } from "./components/Dashboard";
import { WalletView } from "./components/WalletView";
import { TransfersView } from "./components/TransfersView";
import { MiningView } from "./components/MiningView";
import { ExplorerView } from "./components/ExplorerView";
import { NodeConsoleView } from "./components/NodeConsoleView";
import { SettingsView } from "./components/SettingsView";
import { WalletModal } from "./components/WalletModal";
import { Block, ExplorerRoute, NodeStatus, SyncStatus, WalletSummary, AccountInfo, MinerGamificationStats, RankInfo } from "./types";
import { api, formatWeiToRogue } from "./services/api";
import { Loader2, ShieldAlert, AlertTriangle } from "lucide-react";

const DEFAULT_HTTP_PORT = 38845;
const DEFAULT_WS_PORT = 0; // Disabled by default to avoid port collision with local nodes
const DEFAULT_P2P_PORT = 38888;
const DEFAULT_DATADIR = "";
const DEFAULT_BOOTNODES = "";

export const App: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [currentTab, setCurrentTab] = useState<TabType>("dashboard");
  const [explorerTarget, setExplorerTarget] = useState<ExplorerRoute | null>(null);

  const openInExplorer = (route: ExplorerRoute) => {
    setExplorerTarget(route);
    setCurrentTab("explorer");
  };
  const [rpcUrl, setRpcUrl] = useState<string>(() => {
    return localStorage.getItem("rogue_rpc_url") || `http://127.0.0.1:${DEFAULT_HTTP_PORT}`;
  });
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(() => {
    const saved = localStorage.getItem("rogue_auto_lock");
    return saved ? parseInt(saved, 10) : 15;
  });
  const [closeToTray, setCloseToTray] = useState<boolean>(() => {
    return localStorage.getItem("rogue_close_to_tray") === "true";
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
    const saved = localStorage.getItem("rogue_node_datadir");
    if (!saved || saved === "./nodes-local/node-desktop") return DEFAULT_DATADIR;
    return saved;
  });
  const [nodeBootnodes, setNodeBootnodes] = useState<string>(() => {
    return localStorage.getItem("rogue_node_bootnodes") ?? DEFAULT_BOOTNODES;
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
  const [nodeFastMode, setNodeFastMode] = useState<boolean>(() => {
    return localStorage.getItem("rogue_node_fast_mode") === "true";
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
  const [hasVault, setHasVault] = useState<boolean>(true);
  const [pendingWalletSwitchId, setPendingWalletSwitchId] = useState<string | null>(null);
  const [pendingAddressSwitch, setPendingAddressSwitch] = useState<string | null>(null);
  const [showMiningSwitchConfirm, setShowMiningSwitchConfirm] = useState<boolean>(false);
  const [walletIdPendingDelete, setWalletIdPendingDelete] = useState<string | null>(null);
  const [loadingBlocks, setLoadingBlocks] = useState<boolean>(false);
  const [isShuttingDown, setIsShuttingDown] = useState<boolean>(false);
  const [minerStats, setMinerStats] = useState<MinerGamificationStats | null>(null);
  const [ranks, setRanks] = useState<RankInfo[]>([]);

  const lastActivityRef = useRef<number>(Date.now());
  const autoStartInitiated = useRef<boolean>(false);
  const isRefreshingMetricsRef = useRef<boolean>(false);
  const isShuttingDownRef = useRef<boolean>(false);
  const closeToTrayRef = useRef<boolean>(closeToTray);
  closeToTrayRef.current = closeToTray;

  useEffect(() => {
    void api.updateTrayLabels(t("tray.showWindow"), t("tray.quitAndStop"));
  }, [i18n.language, t]);

  // Listen to Tauri log events (clean async unlisten to avoid duplicates)
  useEffect(() => {
    let isCancelled = false;
    let cleanups: (() => void)[] = [];

    async function setupListeners() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        if (isCancelled) return;

        const unlistenBatch = await listen<string[]>("node-log-batch", (event) => {
          const lines = event.payload;
          if (!Array.isArray(lines) || lines.length === 0) return;
          setLogs((prev) => [
            ...prev,
            ...lines.map((line) => `[Geth] ${line}`),
          ].slice(-1500));
        });
        if (isCancelled) {
          unlistenBatch();
        } else {
          cleanups.push(unlistenBatch);
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
          if (closeToTrayRef.current) {
            try {
              await appWindow.hide();
            } catch {
              // ignore
            }
            return;
          }
          isShuttingDownRef.current = true;
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

  const loadActiveWalletAccounts = async (walletId: string): Promise<AccountInfo[]> => {
    try {
      const accs = await api.getDerivedAccounts(walletId);
      setDerivedAccounts(accs);
      return accs;
    } catch (e) {
      console.warn("Could not load derived accounts:", e);
      return [];
    }
  };

  useEffect(() => {
    api.hasVault().then(setHasVault).catch(() => setHasVault(false));
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l" && unlockedAddress) {
        e.preventDefault();
        void handleLockWallet();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [unlockedAddress]);

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
    setLogs((prev) => [...prev.slice(-1500), t("logs.vaultLocked")]);
  };

  const handleWalletUnlocked = async (
    actWallet: WalletSummary,
    walletsList: WalletSummary[],
    isNewlyAdded: boolean = false
  ) => {
    setHasVault(true);
    setAllWallets(walletsList);
    const savedActiveId = localStorage.getItem("rogue_active_wallet_id");
    let found = isNewlyAdded
      ? actWallet
      : walletsList.find((w) => w.id === savedActiveId) || actWallet;

    if (!isNewlyAdded && found.id !== actWallet.id) {
      try {
        found = await api.setActiveWallet(found.id);
      } catch {
        // Fallback to backend active wallet
      }
    }

    localStorage.setItem("rogue_active_wallet_id", found.id);
    setActiveWallet(found);

    const accs = await loadActiveWalletAccounts(found.id);
    const savedAccountAddr = localStorage.getItem(`rogue_active_account_${found.id}`);
    const restoredAccount = !isNewlyAdded && savedAccountAddr
      ? accs.find((a) => a.address.toLowerCase() === savedAccountAddr.toLowerCase())
      : undefined;
    const targetAddr = restoredAccount ? restoredAccount.address : found.primary_address;

    setUnlockedAddress(targetAddr);
    localStorage.setItem(`rogue_active_account_${found.id}`, targetAddr);
    try {
      await api.setEtherbase(rpcUrl, targetAddr);
    } catch {
      // Node might not be ready yet
    }
    setLogs((prev) => [...prev.slice(-1500), t("logs.vaultUnlocked", { name: found.name, address: targetAddr })]);
  };

  const handleSwitchWalletRequest = async (walletId: string) => {
    if (activeWallet?.id === walletId) return;

    if (hashrate > 0) {
      setPendingWalletSwitchId(walletId);
      setPendingAddressSwitch(null);
      setShowMiningSwitchConfirm(true);
      return;
    }

    await executeWalletSwitch(walletId);
  };

  const executeWalletSwitch = async (walletId: string, stopMining: boolean = false) => {
    try {
      if (stopMining) {
        await api.stopMining(rpcUrl);
        setHashrate(0);
        setLogs((prev) => [...prev, t("logs.miningStoppedAuto")]);
      }

      const summary = await api.setActiveWallet(walletId);
      setActiveWallet(summary);
      localStorage.setItem("rogue_active_wallet_id", walletId);
      const accs = await loadActiveWalletAccounts(walletId);
      const savedAccountAddr = localStorage.getItem(`rogue_active_account_${walletId}`);
      const restoredAccount = savedAccountAddr
        ? accs.find((a) => a.address.toLowerCase() === savedAccountAddr.toLowerCase())
        : undefined;
      const targetAddr = restoredAccount ? restoredAccount.address : summary.primary_address;

      setUnlockedAddress(targetAddr);
      localStorage.setItem(`rogue_active_account_${walletId}`, targetAddr);
      try {
        await api.setEtherbase(rpcUrl, targetAddr);
      } catch {
        // Node might not be ready yet
      }
      setLogs((prev) => [...prev, t("logs.walletSwitched", { name: summary.name, address: targetAddr })]);
    } catch (err) {
      console.error("Error switching wallet:", err);
    } finally {
      setShowMiningSwitchConfirm(false);
      setPendingWalletSwitchId(null);
      setPendingAddressSwitch(null);
    }
  };

  const handleRequestRemoveWallet = (walletId: string) => {
    if (allWallets.length <= 1) return;
    setWalletIdPendingDelete(walletId);
  };

  const handleConfirmRemoveWallet = async () => {
    if (!walletIdPendingDelete) return;
    const walletId = walletIdPendingDelete;
    setWalletIdPendingDelete(null);
    try {
      const updated = await api.removeWallet(walletId);
      setAllWallets(updated);
      localStorage.removeItem(`rogue_active_account_${walletId}`);
      if (activeWallet?.id === walletId && updated.length > 0) {
        await executeWalletSwitch(updated[0].id);
      }
      setLogs((prev) => [...prev, t("logs.walletRemoved")]);
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

  const handleSelectAddress = async (addr: string) => {
    if (addr.toLowerCase() === unlockedAddress?.toLowerCase()) return;
    if (hashrate > 0) {
      setPendingAddressSwitch(addr);
      setPendingWalletSwitchId(null);
      setShowMiningSwitchConfirm(true);
      return;
    }
    await executeAddressSwitch(addr, false);
  };

  const executeAddressSwitch = async (addr: string, stopMining: boolean = false) => {
    try {
      if (stopMining) {
        await api.stopMining(rpcUrl);
        setHashrate(0);
        setLogs((prev) => [...prev, t("logs.miningStoppedAuto")]);
      }
      setUnlockedAddress(addr);
      if (activeWallet?.id) {
        localStorage.setItem(`rogue_active_account_${activeWallet.id}`, addr);
      }
      setLogs((prev) => [...prev, t("logs.addressSelected", { address: addr })]);
      try {
        await api.setEtherbase(rpcUrl, addr);
      } catch {
        // Node might not be ready yet
      }
      const [balWei, stats] = await Promise.all([
        api.getBalanceWei(rpcUrl, addr).catch(() => null),
        api.getMinerStats(rpcUrl, addr, i18n.language).catch(() => null),
      ]);
      if (balWei !== null) {
        setBalance(formatWeiToRogue(balWei, 4));
      } else {
        setBalance("0.0000");
      }
      if (stats) {
        setMinerStats(stats);
      }
    } catch {
      // ignore
    } finally {
      setShowMiningSwitchConfirm(false);
      setPendingAddressSwitch(null);
      setPendingWalletSwitchId(null);
    }
  };

  // Fetch localized on-chain rank definitions and refresh stats on language change
  useEffect(() => {
    if (!rpcConnected) return;
    let cancelled = false;

    api.getAllRanks(rpcUrl, i18n.language).then((loadedRanks) => {
      if (!cancelled && loadedRanks.length > 0) {
        setRanks(loadedRanks);
      }
    });

    if (unlockedAddress) {
      api.getMinerStats(rpcUrl, unlockedAddress, i18n.language).then((stats) => {
        if (!cancelled && stats) {
          setMinerStats(stats);
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [rpcConnected, rpcUrl, i18n.language, unlockedAddress]);

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
          setLogs((prev) => [...prev.slice(-1500), t("logs.autoLockedInactivity")]);
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
    if (isRefreshingMetricsRef.current) return;
    isRefreshingMetricsRef.current = true;
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
          const balWei = await api.getBalanceWei(rpcUrl, unlockedAddress);
          setBalance(formatWeiToRogue(balWei, 4));
        } catch {
          // Transient balance query failure
        }

        try {
          const stats = await api.getMinerStats(rpcUrl, unlockedAddress, i18n.language);
          if (stats) {
            setMinerStats(stats);
          }
        } catch {
          // Transient gamification query failure
        }
      }
    } catch {
      // Node is unreachable via RPC endpoint
      setRpcConnected(false);
      setHashrate(0);
      setPeerCount(0);
      setSyncStatus({
        isSyncing: false,
        startingBlock: 0,
        currentBlock: 0,
        highestBlock: 0,
        progressPercentage: 100,
      });
    } finally {
      isRefreshingMetricsRef.current = false;
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

  const pushAppLog = useCallback(
    (message: string, level: "INFO" | "WARN" | "ERROR" | "DEBUG" = "INFO") => {
      const formatted = message.startsWith("[") ? message : `[App] ${message}`;
      setLogs((prev) => [...prev.slice(-1500), formatted]);
      void api.appendAppLog(level, message);
    },
    []
  );

  const handleStartNode = async (
    mine: boolean = false,
    threads: number = 2,
    coinbase?: string,
    fastModeOverride?: boolean
  ) => {
    try {
      const msg = await api.startNode({
        datadir: nodeDatadir.trim() ? nodeDatadir.trim() : undefined,
        http_port: nodeHttpPort,
        ws_port: nodeWsPort,
        p2p_port: nodeP2pPort,
        bootnodes: nodeBootnodes,
        mine,
        miner_threads: threads,
        fast_mode: fastModeOverride ?? nodeFastMode,
        coinbase: coinbase || unlockedAddress || undefined,
        cache: nodeCache,
        syncmode: nodeSyncmode,
        verbosity: nodeVerbosity,
      });
      pushAppLog(`[Manager] ${msg}`, "INFO");
      const activeRpc = `http://127.0.0.1:${nodeHttpPort}`;
      setRpcUrl(activeRpc);
      localStorage.setItem("rogue_rpc_url", activeRpc);
      refreshMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pushAppLog(`[Manager Error] ${msg}`, "ERROR");
      throw err;
    }
  };

  const handleRestartNodeWithFastMode = async (useFast: boolean) => {
    setNodeFastMode(useFast);
    localStorage.setItem("rogue_node_fast_mode", String(useFast));
    try {
      await api.stopNode();
    } catch {
      // Node may not be running
    }
    await handleStartNode(false, 2, unlockedAddress || undefined, useFast);
  };

  const handleStopNode = async () => {
    try {
      const msg = await api.stopNode();
      pushAppLog(`[Manager] ${msg}`, "INFO");
      refreshMetrics();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      pushAppLog(`[Manager Error] ${msg}`, "ERROR");
    }
  };

  const handleRestartNode = async () => {
    try {
      await api.stopNode();
    } catch {
      // Node may not be running
    }
    await handleStartNode(false, 2, unlockedAddress || undefined);
  };

  // Auto-start node upon application mount with retry backoff (guarded against strict mode)
  useEffect(() => {
    if (autoStartInitiated.current) return;
    autoStartInitiated.current = true;

    let attempts = 0;
    let isCancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const tryAutoStart = async () => {
      try {
        await handleStartNode(false);
      } catch (err) {
        if (!isCancelled && attempts < 3) {
          attempts++;
          const delay = Math.pow(2, attempts) * 1000;
          setLogs((prev) => [
            ...prev.slice(-1500),
            `[Auto-Start] Retry attempt ${attempts}/3 in ${delay / 1000}s...`,
          ]);
          retryTimer = setTimeout(tryAutoStart, delay);
        }
      }
    };

    tryAutoStart();
    return () => {
      isCancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  const handleRetryPeers = async () => {
    if (!nodeBootnodes) return;
    const enodes = nodeBootnodes.split(",").map((e) => e.trim()).filter(Boolean);
    for (const enode of enodes) {
      try {
        await api.addPeer(rpcUrl, enode);
        setLogs((prev) => [...prev.slice(-1500), `[P2P] Added peer/bootnode: ${enode}`]);
      } catch (err) {
        console.warn("Failed to add peer:", err);
      }
    }
    refreshMetrics();
  };

  const handleCleanChaindata = async (customDatadir?: string) => {
    const targetDir = (customDatadir ?? nodeDatadir).trim() || undefined;
    setLogs((prev) => [...prev.slice(-1500), `[Maintenance] Wiping chaindata at ${targetDir || "OS default"}...`]);
    const res = await api.cleanChaindata(targetDir);
    setLogs((prev) => [...prev.slice(-1500), `[Maintenance] ${res}`]);
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

  const handleSaveCloseToTray = (enabled: boolean) => {
    setCloseToTray(enabled);
    localStorage.setItem("rogue_close_to_tray", String(enabled));
  };

  return (
    <div className="flex flex-col h-screen bg-black text-slate-100 overflow-hidden relative">
      <Navbar
        currentTab={currentTab}
        unlockedAddress={unlockedAddress}
        activeWallet={activeWallet}
        allWallets={allWallets}
        derivedAccounts={derivedAccounts}
        minerStats={minerStats}
        ranks={ranks}
        syncStatus={syncStatus}
        currentBlock={currentBlock}
        nodeStatus={nodeStatus}
        rpcConnected={rpcConnected}
        peerCount={peerCount}
        onRetryPeers={handleRetryPeers}
        onSelectTab={setCurrentTab}
        onOpenWalletModal={(mode) => {
          setWalletModalMode(mode || "unlock");
          setIsWalletModalOpen(true);
        }}
        onLockWallet={handleLockWallet}
        onSelectWallet={handleSwitchWalletRequest}
        onSelectAddress={handleSelectAddress}
        onRemoveWallet={handleRequestRemoveWallet}
        onRefreshMetrics={refreshMetrics}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {currentTab === "dashboard" && (
            <Dashboard
              balance={balance}
              currentBlock={currentBlock}
              hashrate={hashrate}
              peerCount={peerCount}
              recentBlocks={recentBlocks}
              onNavigate={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === "wallet" && (
            <WalletView
              unlockedAddress={unlockedAddress}
              activeWallet={activeWallet}
              allWallets={allWallets}
              balance={balance}
              rpcUrl={rpcUrl}
              onRefreshBalance={refreshMetrics}
              onOpenWalletModal={(mode) => {
                setWalletModalMode(mode || "create");
                setIsWalletModalOpen(true);
              }}
              onSelectWallet={handleSwitchWalletRequest}
              onRemoveWallet={handleRequestRemoveWallet}
              onLockWallet={handleLockWallet}
              onSelectAddress={handleSelectAddress}
              onWalletRenamed={handleWalletRenamed}
              onNavigateToTransfers={() => setCurrentTab("transfers")}
              onOpenInExplorer={openInExplorer}
            />
          )}

          {currentTab === "transfers" && (
            <TransfersView
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
              onOpenInExplorer={openInExplorer}
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
              recentBlocks={recentBlocks}
              currentBlock={currentBlock}
              minerStats={minerStats}
              nodeFastMode={nodeFastMode}
              onToggleFastMode={handleRestartNodeWithFastMode}
              onMiningStopped={() => setHashrate(0)}
              onOpenInExplorer={openInExplorer}
            />
          )}

          {currentTab === "explorer" && (
            <ExplorerView
              blocks={recentBlocks}
              onRefresh={refreshBlocks}
              loading={loadingBlocks}
              rpcUrl={rpcUrl}
              initialRoute={explorerTarget}
              onInitialRouteConsumed={() => setExplorerTarget(null)}
            />
          )}

          {currentTab === "console" && (
            <NodeConsoleView
              logs={logs}
              onClearLogs={() => setLogs([])}
              rpcUrl={rpcUrl}
              nodeStatus={nodeStatus}
              peerCount={peerCount}
              syncStatus={syncStatus}
              onStartNode={() => handleStartNode(false, 2, unlockedAddress || undefined)}
              onStopNode={handleStopNode}
              onRestartNode={handleRestartNode}
            />
          )}

          {currentTab === "settings" && (
            <SettingsView
              rpcUrl={rpcUrl}
              onSaveRpcUrl={handleSaveRpcUrl}
              autoLockMinutes={autoLockMinutes}
              onSaveAutoLockMinutes={handleSaveAutoLock}
              closeToTray={closeToTray}
              onSaveCloseToTray={handleSaveCloseToTray}
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
        isOpen={isWalletModalOpen || !unlockedAddress}
        onClose={() => {
          if (unlockedAddress) {
            setIsWalletModalOpen(false);
          }
        }}
        onWalletUnlocked={handleWalletUnlocked}
        initialMode={unlockedAddress ? walletModalMode : hasVault ? "unlock" : "create"}
        isVaultUnlocked={!!unlockedAddress}
        hasVault={hasVault}
        onVaultReset={() => {
          setHasVault(false);
          localStorage.removeItem("rogue_active_wallet_id");
        }}
      />

      {/* Confirmation Modal when deleting a wallet */}
      {walletIdPendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-zinc-950 border border-white/20 rounded-[2px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-white shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t("wallet.deleteConfirm.title")}</h3>
                <p className="text-xs text-zinc-300">
                  {allWallets.find((w) => w.id === walletIdPendingDelete)?.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {t("wallet.deleteConfirm.description")}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => setWalletIdPendingDelete(null)}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg transition"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleConfirmRemoveWallet}
                className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-mono uppercase tracking-wider font-bold rounded-[2px] shadow-[0_0_15px_rgba(255,255,255,0.15)] transition"
              >
                {t("common.confirmDelete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal when switching wallet/account while mining is active */}
      {showMiningSwitchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-100">
          <div className="w-full max-w-md bg-zinc-950 border border-white/20 rounded-[2px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-black border border-white/20 flex items-center justify-center text-white shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{t("mining.switchConfirm.title")}</h3>
                <p className="text-xs text-zinc-300">{t("mining.switchConfirm.subtitle")}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-400 leading-relaxed">
              {t("mining.switchConfirm.description")}
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-zinc-800">
              <button
                onClick={() => {
                  setShowMiningSwitchConfirm(false);
                  setPendingWalletSwitchId(null);
                  setPendingAddressSwitch(null);
                }}
                className="px-3.5 py-1.5 text-xs text-zinc-400 hover:text-white rounded-lg transition"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  if (pendingWalletSwitchId) {
                    executeWalletSwitch(pendingWalletSwitchId, true);
                  } else if (pendingAddressSwitch) {
                    executeAddressSwitch(pendingAddressSwitch, true);
                  }
                }}
                className="px-4 py-1.5 bg-white hover:bg-zinc-200 text-black text-xs font-mono uppercase tracking-wider font-bold rounded-[2px] shadow-[0_0_15px_rgba(255,255,255,0.15)] transition"
              >
                {t("mining.switchConfirm.stopAndSwitch")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Graceful Shutdown Modal Overlay */}
      {isShuttingDown && (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-6 text-center select-none animate-fadeIn">
          <div className="w-16 h-16 rounded-full bg-black border border-white/25 flex items-center justify-center mb-6 shadow-[0_0_25px_rgba(255,255,255,0.15)]">
            <Loader2 className="w-8 h-8 text-white animate-spin" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">
            {t("shutdown.title")}
          </h2>
          <p className="text-sm text-zinc-400 max-w-md mt-2">
            {t("shutdown.description")}
          </p>
          <div className="mt-6 flex items-center space-x-2 text-xs font-mono text-white bg-white/10 border border-white/20 px-3 py-1.5 rounded-[2px]">
            <ShieldAlert className="w-4 h-4 text-white" />
            <span>{t("shutdown.badge")}</span>
          </div>
        </div>
      )}
    </div>
  );
};
