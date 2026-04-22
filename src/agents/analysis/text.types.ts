export type InterestDepth = "passing" | "moderate" | "passionate";

export type EvidenceExcerpt = {
  readonly text: string;
  readonly sourcePostUrl: string;
  readonly postedAt: string;
};

export type Interest = {
  readonly topic: string;
  readonly mentionCount: number;
  readonly mostRecentMention: string;
  readonly depth: InterestDepth;
  readonly evidence: readonly EvidenceExcerpt[];
};

export type Achievement = {
  readonly title: string;
  readonly date: string;
  readonly category: "launch" | "funding" | "promotion" | "race" | "certification" | "milestone" | "other";
  readonly sourcePostUrl: string;
};

export type RecentHook = {
  readonly summary: string;
  readonly date: string;
  readonly sourcePostUrl: string;
  readonly conversationPotential: number;
};

export type PersonalityProfile = {
  readonly tone: readonly string[];
  readonly values: readonly string[];
  readonly communicationStyle: string;
};

export type CommunityAffiliation = {
  readonly name: string;
  readonly role: "member" | "leader" | "organizer" | "participant" | "unknown";
  readonly activityLevel: "high" | "moderate" | "low";
  readonly signals: readonly string[];
};

export type TextAnalysis = {
  readonly interests: readonly Interest[];
  readonly achievements: readonly Achievement[];
  readonly recentHooks: readonly RecentHook[];
  readonly personality: PersonalityProfile;
  readonly careerNarrative: string;
  readonly communities: readonly CommunityAffiliation[];
  readonly totalPostsAnalyzed: number;
};
