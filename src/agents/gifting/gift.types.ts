export type GiftCitation = {
  readonly type: "post" | "image" | "community" | "achievement";
  readonly sourceUrl: string;
  readonly excerpt: string;
};

export type GiftRecommendation = {
  readonly name: string;
  readonly description: string;
  readonly estimatedPriceUsd: number;
  readonly whereToBuy: string;
  readonly citations: readonly GiftCitation[];
  readonly conversationOpener: string;
  readonly creepinessScore: number;
  readonly rank: 1 | 2 | 3;
};

export type CreepinessCheck = {
  readonly passed: boolean;
  readonly score: number;
  readonly reasons: readonly string[];
};
