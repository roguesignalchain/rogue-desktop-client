export interface Block {
  number: string;
  hash: string;
  parentHash: string;
  miner: string;
  difficulty: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string;
  transactions: string[];
}

export interface NodeStatus {
  running: boolean;
  pid?: number | null;
}

export interface NodeLaunchConfig {
  datadir?: string;
  http_port: number;
  ws_port: number;
  p2p_port: number;
  bootnodes?: string;
  mine: boolean;
  miner_threads: number;
  fast_mode: boolean;
  coinbase?: string;
  cache?: number;
  syncmode?: "full" | "snap" | "fast";
  verbosity?: number;
}

export interface SyncStatus {
  isSyncing: boolean;
  startingBlock: number;
  currentBlock: number;
  highestBlock: number;
  progressPercentage: number;
  peersAhead?: boolean;
  stage?: "idle" | "connecting" | "verifying" | "syncing" | "synced";
}

export interface MiningConfig {
  mine: boolean;
  minerThreads: number;
  fastMode: boolean;
  coinbase: string;
  stratumPort: number;
  stratumRunning: boolean;
}

export interface Account {
  address: string;
  balanceROGUE: string;
  index: number;
}

export interface WalletSummary {
  id: string;
  name: string;
  primary_address: string;
  derived_count: number;
}

export interface AccountInfo {
  address: string;
  index: number;
  path: string;
  name?: string;
  categoryId?: string;
}

export interface WalletCategory {
  id: string;
  name: string;
  order: number;
}

export interface NetworkInfo {
  chainId: number;
  networkName: string;
  blockNumber: number;
  peerCount: number;
  difficulty: string;
  syncing: boolean;
  baseFeeGwei: string;
}

