import type { Platform } from "../orchestrator/pipeline.types";
import type { ScrapedProfile } from "../agents/research/research.types";

export type ApifyActorId =
  | "apify/twitter-scraper"
  | "apify/instagram-profile-scraper"
  | "apify/linkedin-profile-scraper"
  | "apify/github-scraper"
  | "apify/tiktok-scraper"
  | "apify/youtube-scraper"
  | "apify/website-content-crawler"
  | "apify/google-search-scraper";

export type ActorRunRequest = {
  readonly actorId: ApifyActorId;
  readonly platform: Platform;
  readonly input: Record<string, unknown>;
  readonly targetUrl: string;
};

export type ActorRunSuccess = {
  readonly status: "success";
  readonly platform: Platform;
  readonly targetUrl: string;
  readonly profile: ScrapedProfile;
  readonly durationMs: number;
};

export type ActorRunFailure = {
  readonly status: "failed";
  readonly platform: Platform;
  readonly targetUrl: string;
  readonly error: string;
  readonly durationMs: number;
};

export type ActorRunResult = ActorRunSuccess | ActorRunFailure;
