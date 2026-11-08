import { Block, NodeStatus, Account, NodeLaunchConfig } from "../types";

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

export const api = {
  // Node management
  startNode: async (config: NodeLaunchConfig): Promise<string> => {
    return safeInvoke("start_node", { config });
  },

  stopNode: async (): Promise<string> => {
    return safeInvoke("stop_node");
  },

  getNodeStatus: async (): Promise<NodeStatus> => {
    try {
      return await safeInvoke<NodeStatus>("get_node_status");
    } catch {
      return { running: false, pid: null };
    }
  },

  // Stratum bridge management
  startStratum: async (listenPort: number, rpcUrl: string): Promise<string> => {
    return safeInvoke("start_stratum", { listenPort, rpcUrl });
  },

  stopStratum: async (): Promise<string> => {
    return safeInvoke("stop_stratum");
  },

  // Wallet and Keystore
  generateMnemonic: async (): Promise<string> => {
    return safeInvoke("generate_mnemonic");
  },

  createWallet: async (mnemonic: string, password: string): Promise<string> => {
    return safeInvoke("create_wallet", { mnemonic, password });
  },

  unlockWallet: async (password: string): Promise<string> => {
    return safeInvoke("unlock_wallet", { password });
  },

  getAccounts: async (): Promise<Account[]> => {
    return safeInvoke("get_accounts");
  },

  signTransaction: async (txHashHex: string): Promise<string> => {
    return safeInvoke("sign_transaction", { txHashHex });
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

  // Convenience RPC helpers
  getBlockNumber: async (rpcUrl: string): Promise<number> => {
    const hex = await api.callRpc<string>(rpcUrl, "eth_blockNumber");
    return parseInt(hex, 16);
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
};

