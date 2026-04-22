import type {
  EmitFn,
  PipelineInput,
  PipelineOutput,
  StageFailure,
} from "./pipeline.types";
import type { ImageAnalysis } from "../agents/analysis/image.types";
import type { TextAnalysis } from "../agents/analysis/text.types";
import type { PersonProfile } from "../agents/synthesis/profile.types";
import type { GiftRecommendation } from "../agents/gifting/gift.types";
import type { OutreachNote } from "../agents/outreach/outreach.types";
import type {
  DiscoveredGroup,
  GroupResearch,
  ScrapedProfile,
} from "../agents/research/research.types";
import { buildEvent, noopEmit } from "./events";
import { getCache } from "../integrations/cache";
import { runScraper } from "../agents/research/scraper";
import { analyzeImages } from "../agents/analysis/image-analyzer";
import { analyzeText } from "../agents/analysis/text-analyzer";
import { filterPersonalInfo } from "../guardrails/personal-filter";
import { synthesizeProfile } from "../agents/synthesis/synthesizer";
import { recommendGifts } from "../agents/gifting/recommender";
import { draftOutreach } from "../agents/outreach/drafter";
import { timed, now } from "../utils/timing";

export async function runPipeline(
  input: PipelineInput,
  emit: EmitFn = noopEmit(),
): Promise<PipelineOutput> {
  const overallStart = performance.now();
  const failures: StageFailure[] = [];

  let profiles: readonly ScrapedProfile[] = [];
  let groups: readonly DiscoveredGroup[] = [];
  let groupResearch: readonly GroupResearch[] = [];
  let hashes: readonly string[] = [];
  let imageAnalysis: ImageAnalysis | null = null;
  let textAnalysis: TextAnalysis | null = null;
  let personProfile: PersonProfile | null = null;
  let gifts: readonly GiftRecommendation[] = [];
  let outreach: OutreachNote | null = null;
  let cached = false;

  // Step 1: Cache check
  emit(buildEvent("cache_check", "started"));
  let previousHashes: readonly string[] = [];
  try {
    const cache = getCache();
    const lookup = cache.lookup(input.prospectUrl, input.forceRefresh ?? false);
    if (lookup.hit) {
      emit(buildEvent("cache_check", "completed", { data: { hit: true, ageMs: lookup.ageMs } }));
      return { ...lookup.dossier.output, cached: true };
    }
    previousHashes = lookup.previousHashes;
    emit(buildEvent("cache_check", "completed", { data: { hit: false, previousHashes: previousHashes.length } }));
  } catch (err) {
    const msg = errorMessage(err);
    failures.push({ stage: "cache_check", error: msg, recoverable: true });
    emit(buildEvent("cache_check", "failed", { message: msg }));
  }

  // Step 2: Scraping (research queue + club detection + cross-link)
  try {
    const { result: scraperResult, durationMs } = await timed(() =>
      runScraper({
        prospectUrl: input.prospectUrl,
        prospectName: input.prospectName ?? "",
        previousHashes,
        emit,
      }),
    );
    profiles = scraperResult.profiles;
    groups = scraperResult.groups;
    groupResearch = scraperResult.groupResearch;
    hashes = scraperResult.hashes;
    for (const f of scraperResult.failures) {
      failures.push({ stage: "scrape", error: f.error, recoverable: true });
    }
    emit(buildEvent("scrape", "completed", {
      durationMs,
      data: { profiles: profiles.length, groups: groups.length, failures: scraperResult.failures.length },
    }));
  } catch (err) {
    const msg = errorMessage(err);
    failures.push({ stage: "scrape", error: msg, recoverable: false });
    emit(buildEvent("scrape", "failed", { message: msg }));
  }

  // Steps 4 + 5: Image analysis + text analysis in parallel
  const [imageOutcome, textOutcome] = await Promise.allSettled([
    runImageAnalysis(profiles, emit),
    runTextAnalysis(profiles, emit),
  ]);

  if (imageOutcome.status === "fulfilled") {
    imageAnalysis = imageOutcome.value;
  } else {
    failures.push({ stage: "image_analysis", error: errorMessage(imageOutcome.reason), recoverable: true });
  }

  if (textOutcome.status === "fulfilled") {
    textAnalysis = textOutcome.value;
  } else {
    failures.push({ stage: "text_analysis", error: errorMessage(textOutcome.reason), recoverable: false });
  }

  // Step 6a: Personal-info filter
  let filteredTextAnalysis: TextAnalysis | null = textAnalysis;
  let redactionCount = 0;
  if (textAnalysis) {
    try {
      const filterResult = await filterPersonalInfo(textAnalysis);
      filteredTextAnalysis = filterResult.filtered;
      textAnalysis = filterResult.filtered;
      redactionCount = filterResult.redactions.length;
    } catch (err) {
      const msg = errorMessage(err);
      failures.push({ stage: "synthesis", error: `personal_filter: ${msg}`, recoverable: false });
      filteredTextAnalysis = null;
    }
  }

  // Step 6b: Synthesis
  if (filteredTextAnalysis) {
    try {
      emit(buildEvent("synthesis", "started"));
      const { result: profile, durationMs } = await timed(() =>
        synthesizeProfile({
          textAnalysis: filteredTextAnalysis!,
          imageAnalysis: imageAnalysis ?? emptyImageAnalysis(),
          groupResearch,
          profiles,
        }),
      );
      personProfile = profile;
      emit(buildEvent("synthesis", "completed", {
        durationMs,
        data: { redactions: redactionCount, interests: profile.mergedInterests.length },
      }));
    } catch (err) {
      const msg = errorMessage(err);
      failures.push({ stage: "synthesis", error: msg, recoverable: false });
      emit(buildEvent("synthesis", "failed", { message: msg }));
    }
  }

  // Step 7: Gift recommendation
  if (personProfile) {
    const profile = personProfile;
    try {
      emit(buildEvent("gift_recommendation", "started"));
      const { result: recs, durationMs } = await timed(() =>
        recommendGifts({ profile, sender: input.sender, groupResearch }),
      );
      gifts = recs;
      emit(buildEvent("gift_recommendation", "completed", { durationMs, data: { count: recs.length } }));
    } catch (err) {
      const msg = errorMessage(err);
      failures.push({ stage: "gift_recommendation", error: msg, recoverable: false });
      emit(buildEvent("gift_recommendation", "failed", { message: msg }));
    }
  }

  // Step 8: Outreach draft
  const [topGift] = gifts;
  if (personProfile && topGift) {
    try {
      emit(buildEvent("outreach_draft", "started"));
      const { result: note, durationMs } = await timed(() =>
        draftOutreach({ profile: personProfile, gift: topGift, sender: input.sender }),
      );
      outreach = note;
      emit(buildEvent("outreach_draft", "completed", { durationMs, data: { chars: note.characterCount } }));
    } catch (err) {
      const msg = errorMessage(err);
      failures.push({ stage: "outreach_draft", error: msg, recoverable: true });
      emit(buildEvent("outreach_draft", "failed", { message: msg }));
    }
  }

  const output: PipelineOutput = {
    input,
    cached,
    profiles,
    discoveredGroups: groups,
    groupResearch,
    imageAnalysis,
    textAnalysis,
    personProfile,
    gifts,
    outreach,
    failures,
    totalDurationMs: Math.round(performance.now() - overallStart),
    completedAt: now(),
  };

  // Step 9: Cache write (skip if no hashes — cache without delta baseline is worse than useless)
  if (personProfile && gifts.length > 0 && hashes.length > 0) {
    try {
      emit(buildEvent("cache_write", "started"));
      getCache().write(input.prospectUrl, output, hashes);
      emit(buildEvent("cache_write", "completed"));
    } catch (err) {
      const msg = errorMessage(err);
      failures.push({ stage: "cache_write", error: msg, recoverable: true });
      emit(buildEvent("cache_write", "failed", { message: msg }));
    }
  }

  return output;
}

async function runImageAnalysis(
  profiles: readonly ScrapedProfile[],
  emit: EmitFn,
): Promise<ImageAnalysis> {
  emit(buildEvent("image_analysis", "started"));
  const { result, durationMs } = await timed(() => analyzeImages(profiles));
  emit(buildEvent("image_analysis", "completed", {
    durationMs,
    data: { analyzed: result.analyzedCount, skipped: result.skippedCount },
  }));
  return result;
}

async function runTextAnalysis(
  profiles: readonly ScrapedProfile[],
  emit: EmitFn,
): Promise<TextAnalysis> {
  emit(buildEvent("text_analysis", "started"));
  const { result, durationMs } = await timed(() => analyzeText(profiles));
  emit(buildEvent("text_analysis", "completed", {
    durationMs,
    data: { interests: result.interests.length, hooks: result.recentHooks.length },
  }));
  return result;
}

function emptyImageAnalysis(): ImageAnalysis {
  return { results: [], aggregatedItems: [], analyzedCount: 0, skippedCount: 0 };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
