import type { ResearchQueueItem, ScrapedProfile, ScraperFailure } from "./research.types";
import type { ActorRunRequest } from "../../integrations/apify.types";
import { actorIdFor, buildActorInput, runActorsParallel } from "../../integrations/apify";
import type { ScraperEmitter } from "./scraper-emit";

export type RoundResult = {
  readonly profiles: readonly ScrapedProfile[];
  readonly failures: readonly ScraperFailure[];
};

export async function runScrapeRound(
  items: readonly ResearchQueueItem[],
  emitter: ScraperEmitter,
): Promise<RoundResult> {
  const requests: ActorRunRequest[] = [];
  const skipped: ScraperFailure[] = [];

  for (const item of items) {
    const actorId = actorIdFor(item.platform);
    if (!actorId) {
      skipped.push({
        stage: "scrape",
        error: `no actor for platform: ${item.platform}`,
        url: item.url,
      });
      continue;
    }
    requests.push({
      actorId,
      platform: item.platform,
      targetUrl: item.url,
      input: buildActorInput(item.platform, item.url, item.query),
    });
  }

  if (requests.length === 0) return { profiles: [], failures: skipped };

  emitter.started("scrape", { actorCount: requests.length });
  const results = await runActorsParallel(requests);

  const profiles: ScrapedProfile[] = [];
  const failures: ScraperFailure[] = [...skipped];

  for (const result of results) {
    if (result.status === "success") {
      profiles.push(result.profile);
      emitter.completed("scrape", result.durationMs, {
        platform: result.platform,
        url: result.targetUrl,
        posts: result.profile.recentPosts.length,
      });
    } else {
      failures.push({ stage: "scrape", error: result.error, url: result.targetUrl });
      emitter.failed("scrape", result.error, { platform: result.platform, url: result.targetUrl });
    }
  }

  return { profiles, failures };
}
