import { ApifyClient } from "apify-client";
import type {
  ActorRunRequest,
  ActorRunResult,
  ApifyActorId,
} from "./apify.types";
import type { Platform } from "../orchestrator/pipeline.types";
import type { ScrapedPost, ScrapedProfile } from "../agents/research/research.types";
import { requireSecret } from "../utils/env";
import { withRetry } from "../utils/retry";
import { hashPost } from "../utils/hash";
import { now } from "../utils/timing";
import { mapWithConcurrency } from "../utils/concurrency";

const ACTOR_TIMEOUT_MS = 120_000;
const MAX_PARALLEL_ACTORS = 3;

let client: ApifyClient | null = null;

function getClient(): ApifyClient {
  if (!client) {
    client = new ApifyClient({ token: requireSecret("APIFY_API_KEY") });
  }
  return client;
}

export function detectPlatform(url: string): Platform {
  const u = url.toLowerCase();
  if (u.includes("twitter.com") || u.includes("x.com")) return "twitter";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("linkedin.com")) return "linkedin";
  if (u.includes("github.com")) return "github";
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  return "website";
}

export function actorIdFor(platform: Platform): ApifyActorId | null {
  switch (platform) {
    case "twitter": return "apify/twitter-scraper";
    case "instagram": return "apify/instagram-profile-scraper";
    case "linkedin": return "apify/linkedin-profile-scraper";
    case "github": return "apify/github-scraper";
    case "tiktok": return "apify/tiktok-scraper";
    case "youtube": return "apify/youtube-scraper";
    case "website": return "apify/website-content-crawler";
    case "google": return "apify/google-search-scraper";
    default: return null;
  }
}

export function buildActorInput(
  platform: Platform,
  targetUrl: string,
  query?: string,
): Record<string, unknown> {
  switch (platform) {
    case "twitter":
      return { startUrls: [{ url: targetUrl }], maxItems: 50 };
    case "instagram":
      return { usernames: [extractHandle(targetUrl)], resultsLimit: 30 };
    case "linkedin":
      return { profileUrls: [targetUrl] };
    case "github":
      return { usernames: [extractHandle(targetUrl)] };
    case "tiktok":
      return { profiles: [extractHandle(targetUrl)], resultsPerPage: 20 };
    case "youtube":
      return { startUrls: [{ url: targetUrl }], maxResults: 20 };
    case "website":
      return { startUrls: [{ url: targetUrl }], maxCrawlPages: 5 };
    case "google":
      return { queries: query ?? targetUrl, resultsPerPage: 10 };
  }
}

export async function runActor(req: ActorRunRequest): Promise<ActorRunResult> {
  const started = performance.now();
  try {
    const items = await withRetry(
      () => runActorOnce(req.actorId, req.input),
      { maxRetries: 2 },
    );
    const profile = mapItemsToProfile(req.platform, req.targetUrl, items);
    return {
      status: "success",
      platform: req.platform,
      targetUrl: req.targetUrl,
      profile,
      durationMs: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      status: "failed",
      platform: req.platform,
      targetUrl: req.targetUrl,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - started),
    };
  }
}

export async function runActorsParallel(
  requests: readonly ActorRunRequest[],
): Promise<readonly ActorRunResult[]> {
  const settled = await Promise.allSettled(
    mapWithConcurrency(requests, MAX_PARALLEL_ACTORS, (r) => runActor(r)),
  );
  return settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value;
    const req = requests[i]!;
    return {
      status: "failed" as const,
      platform: req.platform,
      targetUrl: req.targetUrl,
      error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      durationMs: 0,
    };
  });
}

async function runActorOnce(
  actorId: ApifyActorId,
  input: Record<string, unknown>,
): Promise<readonly Record<string, unknown>[]> {
  const run = await getClient().actor(actorId).call(input, { timeout: ACTOR_TIMEOUT_MS / 1000 });
  const { items } = await getClient().dataset(run.defaultDatasetId).listItems();
  return items as readonly Record<string, unknown>[];
}

function mapItemsToProfile(
  platform: Platform,
  targetUrl: string,
  items: readonly Record<string, unknown>[],
): ScrapedProfile {
  const posts: ScrapedPost[] = [];
  let bio: string | undefined;
  let displayName: string | undefined;
  let handle: string | undefined;
  let location: string | undefined;
  let followersCount: number | undefined;
  const linksInBio: string[] = [];

  for (const item of items) {
    const post = mapItemToPost(platform, item);
    if (post) posts.push(post);

    bio = bio ?? pickString(item, ["biography", "bio", "description", "about"]);
    displayName = displayName ?? pickString(item, ["fullName", "displayName", "name", "author"]);
    handle = handle ?? pickString(item, ["username", "handle", "userName", "screenName"]);
    location = location ?? pickString(item, ["location", "city"]);
    followersCount = followersCount ?? pickNumber(item, ["followersCount", "followers", "followerCount"]);

    const externalUrl = pickString(item, ["externalUrl", "website", "url"]);
    if (externalUrl && externalUrl !== targetUrl) linksInBio.push(externalUrl);
  }

  return {
    platform,
    url: targetUrl,
    handle,
    displayName,
    bio,
    location,
    followersCount,
    pinnedPosts: [],
    recentPosts: posts,
    linksInBio: Array.from(new Set(linksInBio)),
    scrapedAt: now(),
  };
}

function mapItemToPost(
  platform: Platform,
  item: Record<string, unknown>,
): ScrapedPost | null {
  const text = pickString(item, ["text", "caption", "content", "title", "description", "snippet"]);
  if (!text) return null;
  const url = pickString(item, ["url", "postUrl", "link", "permalink"]) ?? "";
  const postedAt =
    pickString(item, ["timestamp", "createdAt", "publishedAt", "date", "postedAt"]) ?? now();
  const imageUrls = pickStringArray(item, ["images", "imageUrl", "thumbnail", "mediaUrls"]);
  const engagementScore = pickNumber(item, ["likes", "likeCount", "favoriteCount", "engagementScore"]);
  const id = pickString(item, ["id", "postId", "tweetId"]) ?? hashPost(text, url).slice(0, 16);
  return {
    id,
    platform,
    url,
    text,
    imageUrls,
    postedAt,
    engagementScore,
    contentHash: hashPost(text, url),
  };
}

function pickString(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function pickNumber(obj: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function pickStringArray(obj: Record<string, unknown>, keys: readonly string[]): readonly string[] {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) {
      return v.filter((x): x is string => typeof x === "string");
    }
    if (typeof v === "string" && v.length > 0) return [v];
  }
  return [];
}

function extractHandle(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts[0] ?? url;
  } catch {
    return url;
  }
}
