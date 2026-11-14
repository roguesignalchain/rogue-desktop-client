export type RpcCategory = "chain" | "network" | "mining" | "admin" | "reputation";

export interface RpcPreset {
  id: string;
  category: RpcCategory;
  method: string;
  defaultParams: string;
  descKey: string;
  docAnchor: string;
  requiresApiFlag?: string;
}

export const RPC_PRESETS: RpcPreset[] = [
  // Chain / Eth
  {
    id: "eth_blockNumber",
    category: "chain",
    method: "eth_blockNumber",
    defaultParams: "[]",
    descKey: "console.presets.eth_blockNumber",
    docAnchor: "eth_blocknumber",
  },
  {
    id: "eth_chainId",
    category: "chain",
    method: "eth_chainId",
    defaultParams: "[]",
    descKey: "console.presets.eth_chainId",
    docAnchor: "eth_chainid",
  },
  {
    id: "eth_syncing",
    category: "chain",
    method: "eth_syncing",
    defaultParams: "[]",
    descKey: "console.presets.eth_syncing",
    docAnchor: "eth_syncing",
  },
  {
    id: "eth_gasPrice",
    category: "chain",
    method: "eth_gasPrice",
    defaultParams: "[]",
    descKey: "console.presets.eth_gasPrice",
    docAnchor: "eth_gasprice",
  },
  {
    id: "eth_getBlockByNumber",
    category: "chain",
    method: "eth_getBlockByNumber",
    defaultParams: '[\n  "latest",\n  false\n]',
    descKey: "console.presets.eth_getBlockByNumber",
    docAnchor: "eth_getblockbynumber",
  },
  {
    id: "eth_getBalance",
    category: "chain",
    method: "eth_getBalance",
    defaultParams: '[\n  "0xe9aaE535B7971A9AC8C6af0e4B524D02260D3a03",\n  "latest"\n]',
    descKey: "console.presets.eth_getBalance",
    docAnchor: "eth_getbalance",
  },
  {
    id: "eth_getTransactionByHash",
    category: "chain",
    method: "eth_getTransactionByHash",
    defaultParams: '[\n  "0x0000000000000000000000000000000000000000000000000000000000000000"\n]',
    descKey: "console.presets.eth_getTransactionByHash",
    docAnchor: "eth_gettransactionbyhash",
  },
  {
    id: "eth_getTransactionReceipt",
    category: "chain",
    method: "eth_getTransactionReceipt",
    defaultParams: '[\n  "0x0000000000000000000000000000000000000000000000000000000000000000"\n]',
    descKey: "console.presets.eth_getTransactionReceipt",
    docAnchor: "eth_gettransactionreceipt",
  },

  // Network / Peers
  {
    id: "web3_clientVersion",
    category: "network",
    method: "web3_clientVersion",
    defaultParams: "[]",
    descKey: "console.presets.web3_clientVersion",
    docAnchor: "web3_clientversion",
  },
  {
    id: "net_version",
    category: "network",
    method: "net_version",
    defaultParams: "[]",
    descKey: "console.presets.net_version",
    docAnchor: "net_version",
  },
  {
    id: "net_peerCount",
    category: "network",
    method: "net_peerCount",
    defaultParams: "[]",
    descKey: "console.presets.net_peerCount",
    docAnchor: "net_peercount",
  },
  {
    id: "net_listening",
    category: "network",
    method: "net_listening",
    defaultParams: "[]",
    descKey: "console.presets.net_listening",
    docAnchor: "net_listening",
  },

  // Mining / TxPool
  {
    id: "eth_mining",
    category: "mining",
    method: "eth_mining",
    defaultParams: "[]",
    descKey: "console.presets.eth_mining",
    docAnchor: "eth_mining",
  },
  {
    id: "eth_hashrate",
    category: "mining",
    method: "eth_hashrate",
    defaultParams: "[]",
    descKey: "console.presets.eth_hashrate",
    docAnchor: "eth_hashrate",
  },
  {
    id: "txpool_status",
    category: "mining",
    method: "txpool_status",
    defaultParams: "[]",
    descKey: "console.presets.txpool_status",
    docAnchor: "txpool_status",
  },
  {
    id: "txpool_content",
    category: "mining",
    method: "txpool_content",
    defaultParams: "[]",
    descKey: "console.presets.txpool_content",
    docAnchor: "txpool_content",
  },

  // Admin / Debug
  {
    id: "admin_nodeInfo",
    category: "admin",
    method: "admin_nodeInfo",
    defaultParams: "[]",
    descKey: "console.presets.admin_nodeInfo",
    docAnchor: "admin_nodeinfo",
  },
  {
    id: "admin_peers",
    category: "admin",
    method: "admin_peers",
    defaultParams: "[]",
    descKey: "console.presets.admin_peers",
    docAnchor: "admin_peers",
  },
  {
    id: "debug_metrics",
    category: "admin",
    method: "debug_metrics",
    defaultParams: "[true]",
    descKey: "console.presets.debug_metrics",
    docAnchor: "debug_metrics",
    requiresApiFlag: "debug",
  },

  // Rogue Reputation (eth_call to 0x0000000000000000000000000000000000000020)
  {
    id: "reputation_blocksMined",
    category: "reputation",
    method: "eth_call",
    defaultParams:
      '[\n  {\n    "to": "0x0000000000000000000000000000000000000020",\n    "data": "0x49c9646b000000000000000000000000e9aae535b7971a9ac8c6af0e4b524d02260d3a03"\n  },\n  "latest"\n]',
    descKey: "console.presets.reputation_blocksMined",
    docAnchor: "rogueminerreputation-eth_call",
  },
  {
    id: "reputation_getMinerLevel",
    category: "reputation",
    method: "eth_call",
    defaultParams:
      '[\n  {\n    "to": "0x0000000000000000000000000000000000000020",\n    "data": "0x8037927e000000000000000000000000e9aae535b7971a9ac8c6af0e4b524d02260d3a03"\n  },\n  "latest"\n]',
    descKey: "console.presets.reputation_getMinerLevel",
    docAnchor: "rogueminerreputation-eth_call",
  },
];

export function getRpcDocsUrl(language: string, anchor?: string): string {
  const base = "https://docs.roguechain.org";
  const langPrefix = language.startsWith("es")
    ? "/es"
    : language.startsWith("zh")
    ? "/zh-Hans"
    : "";
  const hash = anchor ? `#${anchor}` : "";
  return `${base}${langPrefix}/docs/rpc/endpoints${hash}`;
}

export function buildCurlCommand(rpcUrl: string, method: string, params: unknown[]): string {
  const payload = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method,
    params,
  });
  const escaped = payload.replace(/'/g, "'\\''");
  return `curl -s -X POST "${rpcUrl}" -H "Content-Type: application/json" -d '${escaped}'`;
}

