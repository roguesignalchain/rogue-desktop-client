export interface Block {
  number: string;
  hash: string;
  parentHash: string;
  miner: string;
  difficulty: string;
  totalDifficulty?: string;
  timestamp: string;
  gasUsed: string;
  gasLimit: string;
  baseFeePerGas?: string;
  size?: string;
  nonce?: string;
  extraData?: string;
  stateRoot?: string;
  transactionsRoot?: string;
  receiptsRoot?: string;
  uncles?: string[];
  transactions: string[];
}

export interface RpcTransaction {
  hash: string;
  nonce: string;
  blockHash: string | null;
  blockNumber: string | null;
  transactionIndex: string | null;
  from: string;
  to: string | null;
  value: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gas: string;
  input: string;
  type?: string;
  chainId?: string;
}

export interface BlockWithTransactions extends Omit<Block, "transactions"> {
  transactions: RpcTransaction[];
}

export interface LogEntry {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  logIndex: string;
  removed?: boolean;
}

export interface TransactionReceipt {
  transactionHash: string;
  transactionIndex: string;
  blockHash: string;
  blockNumber: string;
  from: string;
  to: string | null;
  cumulativeGasUsed: string;
  gasUsed: string;
  effectiveGasPrice?: string;
  contractAddress: string | null;
  logs: LogEntry[];
  status?: string;
  type?: string;
}

export type TokenStandard = "ERC20" | "ERC721" | "ERC1155";

export interface TokenBalance {
  contractAddress: string;
  standard: TokenStandard;
  name: string;
  symbol: string;
  decimals: number;
  rawBalance: string;
  formattedBalance: string;
  isCustom?: boolean;
}

export interface TokenTransferEvent {
  transactionHash: string;
  blockNumber: number;
  logIndex: number;
  contractAddress: string;
  standard: TokenStandard;
  from: string;
  to: string;
  value: string;
  tokenId?: string;
  symbol?: string;
  decimals?: number;
}

export interface NftItem {
  contractAddress: string;
  standard: "ERC721" | "ERC1155";
  tokenId: string;
  balance: string;
  name?: string;
  symbol?: string;
  tokenUri?: string;
  metadataName?: string;
  metadataDescription?: string;
  imageUri?: string;
}

export type ExplorerRoute =
  | { view: "home" }
  | { view: "block"; blockId: string }
  | { view: "tx"; hash: string }
  | { view: "address"; address: string };

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
}

export interface SystemSpecs {
  cpuModel: string;
  cpuCores: number;
  totalRamMb: number;
  availableRamMb: number;
  recommendedThreads: number;
  canRunFastMode: boolean;
  recommendedCacheMb: number;
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

export interface MinerGamificationStats {
  address: string;
  blocksMined: number;
  level: number;
  title: string;
  imageURI?: string;
  currentXP: number;
  nextLevelXP: number;
  progressPercent: number;
}

export interface RankInfo {
  level: number;
  minBlocks: number;
  title: string;
  imageURI: string;
}

