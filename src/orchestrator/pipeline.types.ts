import type { ScrapedProfile, DiscoveredGroup, GroupResearch } from "../agents/research/research.types";
import type { ImageAnalysis } from "../agents/analysis/image.types";
import type { TextAnalysis } from "../agents/analysis/text.types";
import type { PersonProfile } from "../agents/synthesis/profile.types";
import type { GiftRecommendation } from "../agents/gifting/gift.types";
import type { OutreachNote } from "../agents/outreach/outreach.types";

export type Platform =
  | "twitter"
  | "instagram"
  | "linkedin"
  | "github"
  | "tiktok"
  | "youtube"
  | "website"
  | "google";

export type SenderContext = {
  readonly name: string;
  readonly role?: string;
  readonly company?: string;
  readonly reasonForConnecting: string;
  readonly discussionTopic: string;
};

export type PipelineInput = {
  readonly prospectUrl: string;
  readonly prospectName?: string;
  readonly sender: SenderContext;
  readonly forceRefresh?: boolean;
};

export type PipelineStage =
  | "cache_check"
  | "scrape"
  | "link_discovery"
  | "club_detection"
  | "club_research"
  | "image_analysis"
  | "text_analysis"
  | "synthesis"
  | "gift_recommendation"
  | "outreach_draft"
  | "cache_write"
  | "complete"
  | "error";

export type StageEvent = {
  readonly stage: PipelineStage;
  readonly status: "started" | "completed" | "failed" | "partial";
  readonly durationMs?: number;
  readonly message?: string;
  readonly data?: unknown;
  readonly timestamp: string;
};

export type EmitFn = (event: StageEvent) => void;

export type PipelineOutput = {
  readonly input: PipelineInput;
  readonly cached: boolean;
  readonly profiles: readonly ScrapedProfile[];
  readonly discoveredGroups: readonly DiscoveredGroup[];
  readonly groupResearch: readonly GroupResearch[];
  readonly imageAnalysis: ImageAnalysis | null;
  readonly textAnalysis: TextAnalysis | null;
  readonly personProfile: PersonProfile | null;
  readonly gifts: readonly GiftRecommendation[];
  readonly outreach: OutreachNote | null;
  readonly failures: readonly StageFailure[];
  readonly totalDurationMs: number;
  readonly completedAt: string;
};

export type StageFailure = {
  readonly stage: PipelineStage;
  readonly error: string;
  readonly recoverable: boolean;
};
