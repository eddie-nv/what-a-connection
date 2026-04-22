import type { Achievement, RecentHook, PersonalityProfile, CommunityAffiliation } from "../analysis/text.types";

export type MergedInterest = {
  readonly topic: string;
  readonly confidence: number;
  readonly textSignals: number;
  readonly imageSignals: number;
  readonly recency: string;
  readonly evidence: readonly string[];
};

export type GiftAngle = {
  readonly interest: string;
  readonly hook: string;
  readonly rationale: string;
};

export type PersonProfile = {
  readonly summary: string;
  readonly mergedInterests: readonly MergedInterest[];
  readonly achievements: readonly Achievement[];
  readonly recentHooks: readonly RecentHook[];
  readonly personality: PersonalityProfile;
  readonly careerNarrative: string;
  readonly communities: readonly CommunityAffiliation[];
  readonly bestGiftAngle: GiftAngle;
  readonly avoidTopics: readonly string[];
  readonly synthesizedAt: string;
};
