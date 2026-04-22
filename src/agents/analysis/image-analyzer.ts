import type { ScrapedProfile, ScrapedPost } from "../research/research.types";
import type { ImageAnalysis, ImageAnalysisResult, ImageItem, ImageItemCategory } from "./image.types";
import { callClaudeVision, parseJsonFromClaude, isSafePublicHttpsUrl } from "../../integrations/claude";
import { mapWithConcurrency } from "../../utils/concurrency";

const MAX_IMAGES = 15;
const BATCH_SIZE = 4;
const MAX_PARALLEL_BATCHES = 3;
const VALID_CATEGORIES: ReadonlySet<ImageItemCategory> = new Set([
  "book", "music", "game", "sports_equipment", "hobby", "clothing_brand",
  "vehicle", "pet", "food_drink_gear", "decor_collectible", "tech_setup", "other",
]);

const SYSTEM_PROMPT = `You analyze personal photos to surface conversation hooks for a professional gift.

For EACH image you receive, extract objects the person chose to display or use: books, music/instruments/vinyl, games, sports equipment, hobbies, clothing brands, vehicles, pets, food/drink gear, decor/collectibles, tech setups.

Return JSON:
{
  "results": Array<{
    "imageIndex": number,
    "items": Array<{
      "name": string,
      "category": "book" | "music" | "game" | "sports_equipment" | "hobby" | "clothing_brand" | "vehicle" | "pet" | "food_drink_gear" | "decor_collectible" | "tech_setup" | "other",
      "confidence": number,
      "location": string
    }>,
    "sceneDescription": string,
    "styleSignals": string[]
  }>
}

Be specific. "Fellow Stagg EKG kettle" not "kettle". If you can't read a label, say so in location and lower confidence.
Return only JSON, no prose.`;

type ImageCandidate = {
  readonly url: string;
  readonly sourcePostUrl?: string;
  readonly postedAt: string;
  readonly hasTextContext: boolean;
};

type BatchResponse = {
  readonly results: ReadonlyArray<{
    readonly imageIndex?: number;
    readonly items?: ReadonlyArray<{
      readonly name?: unknown;
      readonly category?: unknown;
      readonly confidence?: unknown;
      readonly location?: unknown;
    }>;
    readonly sceneDescription?: unknown;
    readonly styleSignals?: unknown;
  }>;
};

export async function analyzeImages(profiles: readonly ScrapedProfile[]): Promise<ImageAnalysis> {
  const candidates = collectCandidates(profiles);
  if (candidates.length === 0) return emptyAnalysis(0);

  const batches = chunk(candidates, BATCH_SIZE);
  const settled = await Promise.allSettled(
    mapWithConcurrency(batches, MAX_PARALLEL_BATCHES, (batch) => analyzeBatch(batch)),
  );

  const results: ImageAnalysisResult[] = [];
  let skipped = 0;
  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]!;
    const batch = batches[i]!;
    if (outcome.status === "fulfilled") {
      results.push(...outcome.value);
    } else {
      skipped += batch.length;
    }
  }

  return {
    results,
    aggregatedItems: aggregateItems(results),
    analyzedCount: results.length,
    skippedCount: skipped + (candidates.length - results.length - skipped),
  };
}

function collectCandidates(profiles: readonly ScrapedProfile[]): readonly ImageCandidate[] {
  const seen = new Set<string>();
  const candidates: ImageCandidate[] = [];

  const allPosts: ScrapedPost[] = [];
  for (const p of profiles) {
    allPosts.push(...p.pinnedPosts, ...p.recentPosts);
  }

  allPosts.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  for (const post of allPosts) {
    for (const url of post.imageUrls) {
      if (seen.has(url) || !isSafePublicHttpsUrl(url)) continue;
      seen.add(url);
      candidates.push({
        url,
        sourcePostUrl: post.url,
        postedAt: post.postedAt,
        hasTextContext: post.text.trim().length > 10,
      });
      if (candidates.length >= MAX_IMAGES * 2) break;
    }
    if (candidates.length >= MAX_IMAGES * 2) break;
  }

  candidates.sort((a, b) => {
    if (a.hasTextContext !== b.hasTextContext) return a.hasTextContext ? -1 : 1;
    return b.postedAt.localeCompare(a.postedAt);
  });

  return candidates.slice(0, MAX_IMAGES);
}

async function analyzeBatch(batch: readonly ImageCandidate[]): Promise<readonly ImageAnalysisResult[]> {
  const response = await callClaudeVision({
    model: "claude-sonnet-4-6",
    system: SYSTEM_PROMPT,
    userPrompt: `Analyze these ${batch.length} image(s). Index them 0..${batch.length - 1} in the order shown.`,
    images: batch.map((c) => ({ url: c.url })),
    maxTokens: 2000,
  });

  const parsed = parseJsonFromClaude<BatchResponse>(response.text);
  const out: ImageAnalysisResult[] = [];

  for (const raw of parsed.results ?? []) {
    const idx = typeof raw.imageIndex === "number" ? raw.imageIndex : -1;
    const candidate = idx >= 0 && idx < batch.length ? batch[idx] : undefined;
    if (!candidate) continue;
    out.push({
      imageUrl: candidate.url,
      sourcePostUrl: candidate.sourcePostUrl,
      items: (raw.items ?? []).map(normalizeItem).filter((i): i is ImageItem => i !== null),
      sceneDescription: typeof raw.sceneDescription === "string" ? raw.sceneDescription : "",
      styleSignals: Array.isArray(raw.styleSignals)
        ? raw.styleSignals.filter((s): s is string => typeof s === "string")
        : [],
    });
  }

  return out;
}

function normalizeItem(raw: BatchResponse["results"][number]["items"] extends readonly (infer T)[] | undefined ? T : never): ImageItem | null {
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!name) return null;
  const rawCategory = raw.category;
  const category: ImageItemCategory =
    typeof rawCategory === "string" && VALID_CATEGORIES.has(rawCategory as ImageItemCategory)
      ? (rawCategory as ImageItemCategory)
      : "other";
  const confidence =
    typeof raw.confidence === "number" && Number.isFinite(raw.confidence)
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0;
  const location = typeof raw.location === "string" ? raw.location : "";
  return { name, category, confidence, location };
}

function aggregateItems(results: readonly ImageAnalysisResult[]): readonly ImageItem[] {
  const byName = new Map<string, ImageItem>();
  for (const result of results) {
    for (const item of result.items) {
      const key = `${item.category}::${item.name.toLowerCase()}`;
      const existing = byName.get(key);
      if (!existing || item.confidence > existing.confidence) {
        byName.set(key, item);
      }
    }
  }
  return Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence);
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function emptyAnalysis(skipped: number): ImageAnalysis {
  return { results: [], aggregatedItems: [], analyzedCount: 0, skippedCount: skipped };
}
