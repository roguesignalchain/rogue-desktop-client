import { Block, NodeStatus, AccountInfo, WalletSummary, NodeLaunchConfig, SyncStatus, SystemSpecs, MinerGamificationStats, RankInfo } from "../types";
import { readAllRanks, readMinerLevel, readMinerStats } from "../contracts/rogueReputation";

// Safe invoke wrapper for Tauri v2
async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    const tauri = await import("@tauri-apps/api/core");
    return await tauri.invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`[Tauri Invoke Error: ${cmd}]`, err);
    throw err;
  }
}

export function parseDifficultyBigInt(diff: unknown): bigint | null {
  if (diff === undefined || diff === null) return null;
  try {
    if (typeof diff === "bigint") return diff;
    if (typeof diff === "number") {
      if (!Number.isFinite(diff) || diff < 0) return null;
      if (Number.isSafeInteger(diff)) return BigInt(diff);
      return BigInt(Math.trunc(diff).toLocaleString("fullwide", { useGrouping: false }));
    }
    if (typeof diff === "string") {
      const trimmed = diff.trim();
      if (!trimmed) return null;
      return BigInt(trimmed);
    }
    return null;
  } catch {
    return null;
  }
}

export const api = {
  // Node management
  startNode: async (config: NodeLaunchConfig): Promise<string> => {
    return safeInvoke("start_node", { config });
  },

  stopNode: async (): Promise<string> => {
    return safeInvoke("stop_node");
  },

  exitApp: async (): Promise<void> => {
    return safeInvoke("exit_app");
  },

  getNodeStatus: async (): Promise<NodeStatus> => {
    try {
      return await safeInvoke<NodeStatus>("get_node_status");
    } catch {
      return { running: false, pid: null };
    }
  },

  cleanChaindata: async (datadir?: string): Promise<string> => {
    return safeInvoke("clean_chaindata", { datadir });
  },

  // Hardware diagnostics
  getSystemSpecs: async (): Promise<SystemSpecs> => {
    try {
      return await safeInvoke<SystemSpecs>("get_system_specs");
    } catch {
      const cores = typeof navigator !== "undefined" && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 4;
      return {
        cpuModel: "Procesador Estándar",
        cpuCores: cores,
        totalRamMb: 8192,
        availableRamMb: 4096,
        recommendedThreads: Math.max(1, Math.floor(cores / 2)),
        canRunFastMode: true,
        recommendedCacheMb: 512,
      };
    }
  },

  // Wallet and Keystore
  generateMnemonic: async (words: number = 12): Promise<string> => {
    return safeInvoke("generate_mnemonic", { words });
  },

  createWallet: async (mnemonic: string, password: string, name?: string): Promise<WalletSummary> => {
    return safeInvoke("create_wallet", { mnemonic, password, name });
  },

  unlockWallet: async (password: string): Promise<WalletSummary[]> => {
    return safeInvoke("unlock_wallet", { password });
  },

  lockWallet: async (): Promise<void> => {
    return safeInvoke("lock_wallet");
  },

  addWallet: async (mnemonic: string, name?: string): Promise<WalletSummary> => {
    return safeInvoke("add_wallet", { mnemonic, name });
  },

  removeWallet: async (walletId: string): Promise<WalletSummary[]> => {
    return safeInvoke("remove_wallet", { walletId });
  },

  renameWallet: async (walletId: string, newName: string): Promise<void> => {
    return safeInvoke("rename_wallet", { walletId, newName });
  },

  setActiveWallet: async (walletId: string): Promise<WalletSummary> => {
    return safeInvoke("set_active_wallet", { walletId });
  },

  getWallets: async (): Promise<WalletSummary[]> => {
    return safeInvoke("get_wallets");
  },

  getMnemonic: async (walletId?: string): Promise<string> => {
    return safeInvoke("get_mnemonic", { walletId });
  },

  getAccounts: async (): Promise<AccountInfo[]> => {
    return safeInvoke("get_accounts");
  },

  getDerivedAccounts: async (walletId?: string, count?: number): Promise<AccountInfo[]> => {
    return safeInvoke("get_derived_accounts", { walletId, count });
  },

  getPrivateKey: async (accountIndex: number, walletId?: string): Promise<string> => {
    return safeInvoke("get_private_key", { accountIndex, walletId });
  },

  signTransaction: async (txHashHex: string, walletId?: string, accountIndex?: number): Promise<string> => {
    return safeInvoke("sign_transaction", { txHashHex, walletId, accountIndex });
  },

  signRawTransaction: async (params: {
    to: string;
    valueWeiHex: string;
    gasLimit: number;
    gasPriceHex: string;
    nonce: number;
    chainId: number;
    dataHex?: string;
    walletId?: string;
    accountIndex?: number;
  }): Promise<string> => {
    return safeInvoke("sign_raw_transaction", params);
  },

  // Direct JSON-RPC proxy
  callRpc: async <T>(endpoint: string, method: string, params: unknown[] = []): Promise<T> => {
    const isTauri = typeof window !== "undefined" && ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);
    if (isTauri) {
      return safeInvoke<T>("call_rpc", { endpoint, method, params });
    }
    // Web fallback only when running outside Tauri
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
    return data.result as T;
  },

  // Mining control helpers
  isMining: async (rpcUrl: string): Promise<boolean> => {
    try {
      return await api.callRpc<boolean>(rpcUrl, "eth_mining");
    } catch {
      return false;
    }
  },

  getCoinbase: async (rpcUrl: string): Promise<string | null> => {
    try {
      return await api.callRpc<string>(rpcUrl, "eth_coinbase");
    } catch {
      return null;
    }
  },

  setEtherbase: async (rpcUrl: string, address: string): Promise<boolean> => {
    try {
      return await api.callRpc<boolean>(rpcUrl, "miner_setEtherbase", [address]);
    } catch (e) {
      console.warn("miner_setEtherbase error:", e);
      return false;
    }
  },

  getFastMode: async (rpcUrl: string): Promise<boolean> => {
    try {
      return await api.callRpc<boolean>(rpcUrl, "randomx_getFastMode");
    } catch {
      return false;
    }
  },

  getConsensusStatus: async (rpcUrl: string): Promise<Record<string, unknown> | null> => {
    try {
      return await api.callRpc<Record<string, unknown>>(rpcUrl, "randomx_getConsensusStatus");
    } catch {
      return null;
    }
  },

  startMining: async (rpcUrl: string, threads: number, coinbase?: string): Promise<void> => {
    if (coinbase) {
      try {
        await api.callRpc(rpcUrl, "miner_setEtherbase", [coinbase]);
      } catch (e) {
        console.warn("Could not set miner etherbase:", e);
      }
    }
    await api.callRpc(rpcUrl, "miner_start", [threads]);
  },

  stopMining: async (rpcUrl: string): Promise<void> => {
    await api.callRpc(rpcUrl, "miner_stop", []);
  },

  // Protocol Gamification (On-chain System Contract 0x0000...0020 via viem eth_call)
  getMinerStats: async (rpcUrl: string, address: string, lang?: string): Promise<MinerGamificationStats | null> => {
    return await readMinerStats(rpcUrl, address, lang);
  },

  getMinerLevel: async (rpcUrl: string, address: string): Promise<number> => {
    return await readMinerLevel(rpcUrl, address);
  },

  getAllRanks: async (rpcUrl: string, lang?: string): Promise<RankInfo[]> => {
    return await readAllRanks(rpcUrl, lang);
  },

  // Convenience RPC helpers
  getBlockNumber: async (rpcUrl: string): Promise<number> => {
    const hex = await api.callRpc<string>(rpcUrl, "eth_blockNumber");
    return parseInt(hex, 16);
  },

  getBalanceWei: async (rpcUrl: string, address: string): Promise<bigint> => {
    const hex = await api.callRpc<string>(rpcUrl, "eth_getBalance", [address, "latest"]);
    return BigInt(hex || "0x0");
  },

  getNonce: async (rpcUrl: string, address: string): Promise<number> => {
    const hex = await api.callRpc<string>(rpcUrl, "eth_getTransactionCount", [address, "pending"]);
    return parseInt(hex || "0x0", 16);
  },

  getGasPrice: async (rpcUrl: string): Promise<bigint> => {
    try {
      const hex = await api.callRpc<string>(rpcUrl, "eth_gasPrice");
      return BigInt(hex || "0x3b9aca00");
    } catch {
      return BigInt(1_000_000_000);
    }
  },

  getBalance: async (rpcUrl: string, address: string): Promise<string> => {
    const hex = await api.callRpc<string>(rpcUrl, "eth_getBalance", [address, "latest"]);
    const wei = BigInt(hex || "0x0");
    const whole = wei / BigInt(10 ** 18);
    const fraction = (wei % BigInt(10 ** 18)).toString().padStart(18, "0").slice(0, 4);
    return `${whole}.${fraction}`;
  },

  getRecentBlocks: async (rpcUrl: string, count: number = 5): Promise<Block[]> => {
    const currentHex = await api.callRpc<string>(rpcUrl, "eth_blockNumber");
    const current = parseInt(currentHex, 16);
    const blocks: Block[] = [];
    for (let i = 0; i < count && current - i >= 0; i++) {
      const bHex = "0x" + (current - i).toString(16);
      try {
        const b = await api.callRpc<Block>(rpcUrl, "eth_getBlockByNumber", [bHex, false]);
        if (b) blocks.push(b);
      } catch (e) {
        console.error(e);
      }
    }
    return blocks;
  },

  getHashrate: async (rpcUrl: string): Promise<number> => {
    try {
      const hex = await api.callRpc<string>(rpcUrl, "eth_hashrate");
      return parseInt(hex, 16);
    } catch {
      return 0;
    }
  },

  getPeerCount: async (rpcUrl: string): Promise<number> => {
    try {
      const hex = await api.callRpc<string>(rpcUrl, "net_peerCount");
      return parseInt(hex, 16);
    } catch {
      return 0;
    }
  },

  getSyncStatus: async (rpcUrl: string, currentLocalBlock: number = 0): Promise<SyncStatus> => {
    try {
      const res = await api.callRpc<unknown>(rpcUrl, "eth_syncing");
      if (res && typeof res === "object") {
        const raw = res as Record<string, string>;
        const startingBlock = raw.startingBlock ? parseInt(raw.startingBlock, 16) : 0;
        const currentBlock = raw.currentBlock ? parseInt(raw.currentBlock, 16) : 0;
        const highestBlock = raw.highestBlock ? parseInt(raw.highestBlock, 16) : 0;
        const total = highestBlock - startingBlock;
        const progressed = currentBlock - startingBlock;
        const progressPercentage =
          total > 0 ? Math.min(100, Math.max(0, Math.round((progressed / total) * 100))) : 0;

        if (highestBlock > 0 && highestBlock > currentBlock) {
          return {
            isSyncing: true,
            startingBlock,
            currentBlock,
            highestBlock,
            progressPercentage,
            stage: "syncing",
          };
        }
      }

      // If eth_syncing is false, inspect peer total difficulty to verify if peers are ahead
      let peersAhead = false;
      let peerHighestTd = BigInt(0);
      let localTd = BigInt(0x10000); // Genesis TD default

      try {
        const latestBlock = await api.callRpc<{ totalDifficulty?: string }>(rpcUrl, "eth_getBlockByNumber", ["latest", false]);
        if (latestBlock?.totalDifficulty) {
          localTd = BigInt(latestBlock.totalDifficulty);
        }
      } catch {
        // Fallback
      }

      try {
        const peers = await api.callRpc<Array<{ protocols?: { eth?: { difficulty?: number | string; head?: string } } }>>(
          rpcUrl,
          "admin_peers"
        );
        if (Array.isArray(peers) && peers.length > 0) {
          for (const p of peers) {
            const diff = p.protocols?.eth?.difficulty;
            const td = parseDifficultyBigInt(diff);
            if (td !== null) {
              if (td > peerHighestTd) {
                peerHighestTd = td;
              }
              if (td > localTd) {
                peersAhead = true;
              }
            }
          }
        }
      } catch {
        // Transient admin_peers failure
      }

      if (peersAhead) {
        return {
          isSyncing: true,
          startingBlock: 0,
          currentBlock: currentLocalBlock,
          highestBlock: currentLocalBlock,
          progressPercentage: 0,
          peersAhead: true,
          stage: "verifying",
        };
      }

      // eth_syncing is false and no peers are ahead
      return {
        isSyncing: false,
        startingBlock: 0,
        currentBlock: currentLocalBlock,
        highestBlock: currentLocalBlock,
        progressPercentage: 100,
        peersAhead: false,
        stage: "synced",
      };
    } catch {
      return {
        isSyncing: false,
        startingBlock: 0,
        currentBlock: 0,
        highestBlock: 0,
        progressPercentage: 0,
        stage: "idle",
      };
    }
  },

  addPeer: async (rpcUrl: string, enode: string): Promise<boolean> => {
    try {
      return await api.callRpc<boolean>(rpcUrl, "admin_addPeer", [enode]);
    } catch {
      return false;
    }
  },
};

