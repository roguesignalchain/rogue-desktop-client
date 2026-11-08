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

export interface NetworkInfo {
  chainId: number;
  networkName: string;
  blockNumber: number;
  peerCount: number;
  difficulty: string;
  syncing: boolean;
  baseFeeGwei: string;
}

