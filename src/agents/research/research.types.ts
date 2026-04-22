import type { Platform } from "../../orchestrator/pipeline.types";

export type ScrapedPost = {
  readonly id: string;
  readonly platform: Platform;
  readonly url: string;
  readonly text: string;
  readonly imageUrls: readonly string[];
  readonly postedAt: string;
  readonly engagementScore?: number;
  readonly contentHash: string;
};

export type ScrapedProfile = {
  readonly platform: Platform;
  readonly url: string;
  readonly handle?: string;
  readonly displayName?: string;
  readonly bio?: string;
  readonly location?: string;
  readonly followersCount?: number;
  readonly pinnedPosts: readonly ScrapedPost[];
  readonly recentPosts: readonly ScrapedPost[];
  readonly linksInBio: readonly string[];
  readonly scrapedAt: string;
};

export type DiscoveredGroup = {
  readonly name: string;
  readonly type:
    | "club"
    | "community"
    | "meetup"
    | "conference"
    | "cohort"
    | "accelerator"
    | "organization"
    | "sports_club"
    | "hobby_group"
    | "volunteer_org"
    | "discord"
    | "slack"
    | "other";
  readonly url?: string;
  readonly mentionedIn: readonly string[];
  readonly confidence: number;
};

export type GroupResearch = {
  readonly group: DiscoveredGroup;
  readonly summary: string;
  readonly culture: string;
  readonly notableMembers: readonly string[];
  readonly giftRelevance: string;
};

export type ResearchQueueItem = {
  readonly url: string;
  readonly platform: Platform;
  readonly sourceUrl?: string;
  readonly depth: number;
  readonly query?: string;
};

export type ScraperFailure = {
  readonly stage: string;
  readonly error: string;
  readonly url?: string;
};

export type ScraperResult = {
  readonly profiles: readonly ScrapedProfile[];
  readonly groups: readonly DiscoveredGroup[];
  readonly groupResearch: readonly GroupResearch[];
  readonly hashes: readonly string[];
  readonly failures: readonly ScraperFailure[];
};

export type ScraperInput = {
  readonly prospectUrl: string;
  readonly prospectName: string;
  readonly previousHashes?: readonly string[];
  readonly emit?: import("../../orchestrator/pipeline.types").EmitFn;
};
