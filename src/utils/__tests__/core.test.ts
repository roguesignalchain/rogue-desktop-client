import { describe, it, expect } from "vitest";
import { formatHashrate, formatHashrateParts } from "../format";
import { formatWeiToRogue, parseDifficultyBigInt } from "../../services/api";
import {
  decodeExtraDataUtf8,
  formatWeiValue,
  getBlockRewardBreakdown,
  parseOnChainTokenUri,
} from "../explorerDecode";
import { ROGUE_REPUTATION_ADDRESS, rogueSignalChain } from "../../contracts/rogueReputation";

describe("format utilities", () => {
  it("formats hashrate across H/s, kH/s, and MH/s", () => {
    expect(formatHashrateParts(0)).toEqual({ value: "0.00", unit: "H/s" });
    expect(formatHashrateParts(-5)).toEqual({ value: "0.00", unit: "H/s" });
    expect(formatHashrate(420)).toBe("420 H/s");
    expect(formatHashrate(1500)).toBe("1.50 kH/s");
    expect(formatHashrate(2_500_000)).toBe("2.50 MH/s");
  });
});

describe("api formatting and difficulty parsing", () => {
  it("parses numeric, hex, and invalid difficulties safely", () => {
    expect(parseDifficultyBigInt(12345)).toBe(12345n);
    expect(parseDifficultyBigInt("0x100")).toBe(256n);
    expect(parseDifficultyBigInt(null)).toBeNull();
    expect(parseDifficultyBigInt(-1)).toBeNull();
    expect(parseDifficultyBigInt("not-a-number")).toBeNull();
  });

  it("formats wei to ROGUE with requested precision", () => {
    expect(formatWeiToRogue(0n, 4)).toBe("0.0000");
    expect(formatWeiToRogue(23_750_000_000_000_000_000n, 2)).toBe("23.75");
    expect(formatWeiToRogue(1_000_000_000_000_000_000n, 0)).toBe("1");
  });
});

describe("explorerDecode utilities", () => {
  it("calculates Rogue Signal block reward and 95/5 split across eras", () => {
    expect(getBlockRewardBreakdown(0)).toEqual({
      era: 0,
      totalRewardRogue: 0,
      minerRewardRogue: 0,
      treasuryRewardRogue: 0,
    });
    expect(getBlockRewardBreakdown(1)).toEqual({
      era: 0,
      totalRewardRogue: 25,
      minerRewardRogue: 23.75,
      treasuryRewardRogue: 1.25,
    });
    expect(getBlockRewardBreakdown(2_000_001)).toEqual({
      era: 1,
      totalRewardRogue: 12.5,
      minerRewardRogue: 11.875,
      treasuryRewardRogue: 0.625,
    });
  });

  it("decodes printable UTF-8 extraData and rejects binary garbage", () => {
    expect(decodeExtraDataUtf8("0x526f677565")).toBe("Rogue");
    expect(decodeExtraDataUtf8("0x")).toBeNull();
    expect(decodeExtraDataUtf8("0xfffe")).toBeNull();
  });

  it("formats hex wei values cleanly", () => {
    expect(formatWeiValue("0xde0b6b3a7640000", 4)).toBe("1");
    expect(formatWeiValue(undefined)).toBe("0");
  });

  it("parses on-chain base64 tokenURI metadata without external fetches", () => {
    const payload = btoa(JSON.stringify({ name: "Hash Warden", image: "data:image/svg+xml;base64,PHN2Zz4=" }));
    const parsed = parseOnChainTokenUri(`data:application/json;base64,${payload}`);
    expect(parsed?.name).toBe("Hash Warden");
    expect(parsed?.isOnChainImage).toBe(true);
  });
});

describe("Rogue reputation contract constants", () => {
  it("matches Rogue Signal chain ID and system contract address", () => {
    expect(rogueSignalChain.id).toBe(800055);
    expect(ROGUE_REPUTATION_ADDRESS).toBe("0x0000000000000000000000000000000000000020");
  });
});

