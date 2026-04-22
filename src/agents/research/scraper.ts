import type {
  DiscoveredGroup,
  GroupResearch,
  ScrapedProfile,
  ScraperFailure,
  ScraperInput,
  ScraperResult,
} from "./research.types";
import type { ActorRunRequest } from "../../integrations/apify.types";
import { ResearchQueue } from "./research-queue";
import { createEmitter } from "./scraper-emit";
import { runScrapeRound } from "./scrape-round";
import { extractLinks } from "./link-extractor";
import { detectGroups } from "./club-detector";
import { filterNewPosts } from "./delta-filter";
import { summarizeGroup } from "./group-summarizer";
import { detectPlatform, buildActorInput, runActorsParallel } from "../../integrations/apify";

const MAX_ROUNDS = 2;
const MAX_GROUP_SUBSCRAPES = 8;

export async function runScraper(input: ScraperInput): Promise<ScraperResult> {
  const emitter = createEmitter(input.emit);
  const failures: ScraperFailure[] = [];
  const profiles: ScrapedProfile[] = [];

  const queue = new ResearchQueue(MAX_ROUNDS);
  queue.enqueue(input.prospectUrl, detectPlatform(input.prospectUrl), undefined, 0);
  seedGoogleSearch(queue, input.prospectName);

  for (let round = 0; round < MAX_ROUNDS && queue.size() > 0; round++) {
    const items = queue.drain();
    const { profiles: roundProfiles, failures: roundFailures } = await safeRound(items, emitter);
    profiles.push(...roundProfiles);
    failures.push(...roundFailures);

    for (const profile of roundProfiles) {
      try {
        const links = extractLinks(profile);
        for (const link of links) {
          queue.enqueue(link.url, link.platform, link.sourceUrl, round + 1);
        }
      } catch (err) {
        failures.push({ stage: "link_discovery", error: errorMessage(err), url: profile.url });
      }
    }
  }

  const { filteredProfiles, allHashes } = filterNewPosts(profiles, input.previousHashes ?? []);

  const groups = await safeDetectGroups(filteredProfiles, emitter, failures);
  const groupResearch = await researchGroups(groups, emitter, failures, input.prospectName);

  return {
    profiles,
    groups,
    groupResearch,
    hashes: allHashes,
    failures,
  };
}

function seedGoogleSearch(queue: ResearchQueue, prospectName: string): void {
  if (!prospectName) return;
  const query = `"${prospectName}" interests hobbies achievements community`;
  const syntheticUrl = `https://google-search/${encodeURIComponent(query)}`;
  queue.enqueue(syntheticUrl, "google", undefined, 0);
}

async function safeRound(
  items: ReturnType<ResearchQueue["drain"]>,
  emitter: ReturnType<typeof createEmitter>,
): Promise<{ profiles: readonly ScrapedProfile[]; failures: readonly ScraperFailure[] }> {
  try {
    return await runScrapeRound(items, emitter);
  } catch (err) {
    emitter.failed("scrape", errorMessage(err));
    return {
      profiles: [],
      failures: [{ stage: "scrape", error: errorMessage(err) }],
    };
  }
}

async function safeDetectGroups(
  profiles: readonly ScrapedProfile[],
  emitter: ReturnType<typeof createEmitter>,
  failures: ScraperFailure[],
): Promise<readonly DiscoveredGroup[]> {
  if (profiles.length === 0) return [];
  emitter.started("club_detection");
  const start = performance.now();
  try {
    const groups = await detectGroups(profiles);
    emitter.completed("club_detection", Math.round(performance.now() - start), {
      count: groups.length,
    });
    return groups;
  } catch (err) {
    const msg = errorMessage(err);
    failures.push({ stage: "club_detection", error: msg });
    emitter.failed("club_detection", msg);
    return [];
  }
}

async function researchGroups(
  groups: readonly DiscoveredGroup[],
  emitter: ReturnType<typeof createEmitter>,
  failures: ScraperFailure[],
  prospectName: string,
): Promise<readonly GroupResearch[]> {
  const withUrls = groups.filter((g): g is DiscoveredGroup & { url: string } => typeof g.url === "string" && g.url.length > 0);
  if (withUrls.length === 0) return [];

  const selected = withUrls.slice(0, MAX_GROUP_SUBSCRAPES);
  const skipped = withUrls.length - selected.length;
  if (skipped > 0) emitter.partial("club_research", `skipped ${skipped} groups over cap`, { skipped });

  emitter.started("club_research", { count: selected.length });

  const requests: ActorRunRequest[] = selected.map((g) => ({
    actorId: "apify/website-content-crawler",
    platform: "website",
    targetUrl: g.url,
    input: buildActorInput("website", g.url),
  }));

  let actorResults;
  try {
    actorResults = await runActorsParallel(requests);
  } catch (err) {
    const msg = errorMessage(err);
    failures.push({ stage: "club_research", error: msg });
    emitter.failed("club_research", msg);
    return [];
  }

  const research: GroupResearch[] = [];
  for (let i = 0; i < selected.length; i++) {
    const group = selected[i]!;
    const result = actorResults[i];
    if (!result || result.status !== "success") {
      const msg = result && result.status === "failed" ? result.error : "no result";
      failures.push({ stage: "club_research:scrape", error: msg, url: group.url });
      continue;
    }
    const scrapedText = extractText(result.profile);
    try {
      const summary = await summarizeGroup({ group, scrapedText, prospectName });
      research.push(summary);
    } catch (err) {
      failures.push({ stage: "club_research:summarize", error: errorMessage(err), url: group.url });
    }
  }

  if (research.length === 0 && selected.length > 0) {
    emitter.failed("club_research", "all group research attempts failed", { attempted: selected.length });
  } else {
    emitter.completed("club_research", undefined, { count: research.length });
  }
  return research;
}

function extractText(profile: ScrapedProfile): string {
  const parts: string[] = [];
  if (profile.bio) parts.push(profile.bio);
  for (const p of profile.recentPosts) parts.push(p.text);
  return parts.join("\n\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
