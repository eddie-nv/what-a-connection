import { describe, it, expect } from "vitest";
import { evaluateCreepiness } from "./creepiness";
import type { GiftRecommendation } from "../agents/gifting/gift.types";

function gift(over: Partial<GiftRecommendation> = {}): GiftRecommendation {
  return {
    name: "Fellow Stagg EKG Kettle",
    description: "A matte black pour-over kettle with precise temperature control.",
    estimatedPriceUsd: 165,
    whereToBuy: "fellowproducts.com",
    citations: [],
    conversationOpener: "Saw your post about single-origin Ethiopian — this pairs well.",
    creepinessScore: 1,
    rank: 1,
    ...over,
  };
}

describe("evaluateCreepiness", () => {
  it("passes a thoughtful, on-topic gift", () => {
    const result = evaluateCreepiness(gift());
    expect(result.passed).toBe(true);
    expect(result.flagged.length).toBe(0);
  });

  it("rejects banned clothing category", () => {
    const result = evaluateCreepiness(gift({ name: "Designer hoodie", description: "a hoodie" }));
    expect(result.passed).toBe(false);
    expect(result.flagged).toContain("banned_category");
  });

  it("rejects perfume", () => {
    const result = evaluateCreepiness(gift({ name: "Perfume set" }));
    expect(result.passed).toBe(false);
    expect(result.flagged).toContain("banned_category");
  });

  it("flags private info references", () => {
    const result = evaluateCreepiness(
      gift({ conversationOpener: "Thought your kids would love this." }),
    );
    expect(result.passed).toBe(false);
    expect(result.flagged).toContain("private_info_reference");
  });

  it("flags bribery threshold", () => {
    const result = evaluateCreepiness(gift({ estimatedPriceUsd: 500 }));
    expect(result.passed).toBe(false);
    expect(result.flagged).toContain("bribery_threshold");
  });

  it("flags non-finite price", () => {
    const result = evaluateCreepiness(gift({ estimatedPriceUsd: NaN }));
    expect(result.flagged).toContain("bribery_threshold");
  });

  it("flags negative price", () => {
    const result = evaluateCreepiness(gift({ estimatedPriceUsd: -1 }));
    expect(result.flagged).toContain("bribery_threshold");
  });

  it("rule flags override low model score", () => {
    const result = evaluateCreepiness(
      gift({ name: "Necklace", creepinessScore: 1 }),
    );
    expect(result.passed).toBe(false);
  });
});
