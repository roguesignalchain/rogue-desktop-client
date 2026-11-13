import { createPublicClient, defineChain, http, type Address } from "viem";
import type { MinerGamificationStats, RankInfo } from "../types";

export const ROGUE_REPUTATION_ADDRESS = "0x0000000000000000000000000000000000000020" as const;

export const rogueSignalChain = defineChain({
  id: 800055,
  name: "Rogue Signal",
  nativeCurrency: {
    name: "ROGUE",
    symbol: "ROGUE",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:38845"],
    },
  },
});

export const rogueReputationAbi = [
  {
    type: "function",
    name: "getMinerStats",
    stateMutability: "view",
    inputs: [
      { name: "miner", type: "address" },
      { name: "lang", type: "string" },
    ],
    outputs: [
      {
        name: "stats",
        type: "tuple",
        components: [
          { name: "blocksMined", type: "uint256" },
          { name: "level", type: "uint32" },
          { name: "title", type: "string" },
          { name: "imageURI", type: "string" },
          { name: "currentXP", type: "uint256" },
          { name: "nextLevelXP", type: "uint256" },
          { name: "progressBps", type: "uint16" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getAllRanks",
    stateMutability: "view",
    inputs: [{ name: "lang", type: "string" }],
    outputs: [
      {
        name: "ranks",
        type: "tuple[]",
        components: [
          { name: "level", type: "uint32" },
          { name: "minBlocks", type: "uint256" },
          { name: "title", type: "string" },
          { name: "imageURI", type: "string" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getMinerLevel",
    stateMutability: "view",
    inputs: [{ name: "miner", type: "address" }],
    outputs: [{ name: "", type: "uint32" }],
  },
  {
    type: "function",
    name: "blocksMined",
    stateMutability: "view",
    inputs: [{ name: "miner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "meetsLevel",
    stateMutability: "view",
    inputs: [
      { name: "miner", type: "address" },
      { name: "minLevel", type: "uint32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

const ranksCache = new Map<string, RankInfo[]>();

export function normalizeReputationLang(lang?: string): string {
  const base = (lang || "en").trim().toLowerCase().split("-")[0];
  return base || "en";
}

function getReputationClient(rpcUrl: string) {
  return createPublicClient({
    chain: rogueSignalChain,
    transport: http(rpcUrl),
  });
}

export async function readMinerStats(
  rpcUrl: string,
  address: string,
  lang?: string
): Promise<MinerGamificationStats | null> {
  try {
    const client = getReputationClient(rpcUrl);
    const normalizedLang = normalizeReputationLang(lang);
    const stats = await client.readContract({
      address: ROGUE_REPUTATION_ADDRESS,
      abi: rogueReputationAbi,
      functionName: "getMinerStats",
      args: [address as Address, normalizedLang],
    });

    return {
      address,
      blocksMined: Number(stats.blocksMined),
      level: Number(stats.level),
      title: stats.title,
      imageURI: stats.imageURI,
      currentXP: Number(stats.currentXP),
      nextLevelXP: Number(stats.nextLevelXP),
      progressPercent: Number(stats.progressBps) / 100,
    };
  } catch (e) {
    console.warn("Could not retrieve on-chain miner stats:", e);
    return null;
  }
}

export async function readMinerLevel(rpcUrl: string, address: string): Promise<number> {
  try {
    const client = getReputationClient(rpcUrl);
    const level = await client.readContract({
      address: ROGUE_REPUTATION_ADDRESS,
      abi: rogueReputationAbi,
      functionName: "getMinerLevel",
      args: [address as Address],
    });
    return Number(level);
  } catch {
    return 0;
  }
}

export async function readAllRanks(rpcUrl: string, lang?: string): Promise<RankInfo[]> {
  const normalizedLang = normalizeReputationLang(lang);
  const cacheKey = `${rpcUrl}::${normalizedLang}`;
  const cached = ranksCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const client = getReputationClient(rpcUrl);
    const rawRanks = await client.readContract({
      address: ROGUE_REPUTATION_ADDRESS,
      abi: rogueReputationAbi,
      functionName: "getAllRanks",
      args: [normalizedLang],
    });

    const parsed: RankInfo[] = rawRanks.map((r) => ({
      level: Number(r.level),
      minBlocks: Number(r.minBlocks),
      title: r.title,
      imageURI: r.imageURI,
    }));

    ranksCache.set(cacheKey, parsed);
    return parsed;
  } catch (e) {
    console.warn("Could not retrieve on-chain rank definitions:", e);
    return [];
  }
}

