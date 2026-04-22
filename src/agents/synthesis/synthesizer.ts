import type { ScrapedProfile, GroupResearch } from "../research/research.types";
import type { ImageAnalysis } from "../analysis/image.types";
import type { TextAnalysis } from "../analysis/text.types";
import type {
  GiftAngle,
  MergedInterest,
  PersonProfile,
} from "./profile.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";
import { now } from "../../utils/timing";
import { escapeXml, escapeXmlDeep } from "../../utils/xml-escape";

const MAX_INPUT_CHARS = 35_000;

const SYSTEM_PROMPT = `You synthesize a person's digital footprint into an actionable profile for gift selection.

You receive:
- text-derived interests, achievements, recent hooks, personality, communities
- image-derived items (books, gear, decor, pets, etc.)
- group research (clubs and communities they're active in)

Your tasks:
1. Merge interests across text + images. If coffee is mentioned in posts AND a pour-over is in a photo, that's high confidence.
2. Weight recent signals over old ones.
3. Identify the single best "gift angle" — the intersection of their strongest interest and most recent hook.
4. Note communities and what they signal about identity.
5. Flag topics to avoid (politics, religion, health already filtered, but call out any remaining anti-patterns).

Return JSON:
{
  "summary": string,
  "mergedInterests": Array<{
    "topic": string,
    "confidence": number,
    "textSignals": number,
    "imageSignals": number,
    "recency": string,
    "evidence": string[]
  }>,
  "bestGiftAngle": {
    "interest": string,
    "hook": string,
    "rationale": string
  },
  "avoidTopics": string[]
}

mergedInterests sorted by confidence desc.
Return only JSON.`;

type RawSynthesis = {
  readonly summary?: unknown;
  readonly mergedInterests?: readonly Record<string, unknown>[];
  readonly bestGiftAngle?: Record<string, unknown>;
  readonly avoidTopics?: unknown;
};

export type SynthesizerInput = {
  readonly textAnalysis: TextAnalysis;
  readonly imageAnalysis: ImageAnalysis;
  readonly groupResearch: readonly GroupResearch[];
  readonly profiles: readonly ScrapedProfile[];
};

export async function synthesizeProfile(input: SynthesizerInput): Promise<PersonProfile> {
  const corpus = buildCorpus(input);

  const response = await callClaudeText({
    model: "claude-sonnet-4-6",
    maxTokens: 3000,
    temperature: 0.3,
    system: SYSTEM_PROMPT,
    userPrompt: `Synthesize this person.\n\n<data>\n${corpus}\n</data>`,
  });

  const parsed = parseJsonFromClaude<RawSynthesis>(response.text);

  return {
    summary: asString(parsed.summary),
    mergedInterests: normalizeInterests(parsed.mergedInterests),
    achievements: input.textAnalysis.achievements,
    recentHooks: input.textAnalysis.recentHooks,
    personality: input.textAnalysis.personality,
    careerNarrative: input.textAnalysis.careerNarrative,
    communities: input.textAnalysis.communities,
    bestGiftAngle: normalizeAngle(parsed.bestGiftAngle, input),
    avoidTopics: asStringArray(parsed.avoidTopics),
    synthesizedAt: now(),
  };
}

function buildCorpus(input: SynthesizerInput): string {
  const sections: string[] = [];

  sections.push(`<text_interests>${JSON.stringify(escapeXmlDeep(input.textAnalysis.interests))}</text_interests>`);
  sections.push(`<recent_hooks>${JSON.stringify(escapeXmlDeep(input.textAnalysis.recentHooks))}</recent_hooks>`);
  sections.push(`<achievements>${JSON.stringify(escapeXmlDeep(input.textAnalysis.achievements))}</achievements>`);
  sections.push(`<personality>${JSON.stringify(escapeXmlDeep(input.textAnalysis.personality))}</personality>`);
  sections.push(`<communities>${JSON.stringify(escapeXmlDeep(input.textAnalysis.communities))}</communities>`);
  sections.push(`<image_items>${JSON.stringify(escapeXmlDeep(input.imageAnalysis.aggregatedItems))}</image_items>`);
  sections.push(`<group_research>${JSON.stringify(escapeXmlDeep(input.groupResearch))}</group_research>`);

  const bios = input.profiles
    .filter((p) => p.bio)
    .map((p) => `[${p.platform}] ${escapeXml(p.bio ?? "")}`)
    .join("\n");
  if (bios) sections.push(`<bios>${bios}</bios>`);

  let joined = sections.join("\n");
  if (joined.length > MAX_INPUT_CHARS) joined = joined.slice(0, MAX_INPUT_CHARS);
  return joined;
}

function normalizeInterests(raw: readonly Record<string, unknown>[] | undefined): readonly MergedInterest[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r): MergedInterest | null => {
      const topic = asString(r.topic);
      if (!topic) return null;
      return {
        topic,
        confidence: clamp01(r.confidence),
        textSignals: asNumber(r.textSignals, 0),
        imageSignals: asNumber(r.imageSignals, 0),
        recency: asString(r.recency),
        evidence: asStringArray(r.evidence),
      };
    })
    .filter((i): i is MergedInterest => i !== null)
    .sort((a, b) => b.confidence - a.confidence);
}

function normalizeAngle(raw: Record<string, unknown> | undefined, input: SynthesizerInput): GiftAngle {
  if (!raw) return fallbackAngle(input);
  const interest = asString(raw.interest);
  const hook = asString(raw.hook);
  const rationale = asString(raw.rationale);
  if (!interest || !hook) return fallbackAngle(input);
  return { interest, hook, rationale };
}

function fallbackAngle(input: SynthesizerInput): GiftAngle {
  const topInterest = input.textAnalysis.interests[0]?.topic ?? "";
  const topHook = input.textAnalysis.recentHooks[0]?.summary ?? "";
  const topImageItem = input.imageAnalysis.aggregatedItems[0]?.name ?? "";
  const topCommunity = input.textAnalysis.communities[0]?.name ?? "";

  const interest = topInterest || topImageItem || topCommunity;
  const hook = topHook || topInterest || topImageItem;

  if (!interest && !hook) {
    throw new Error("synthesizer: insufficient signal — no interests, hooks, images, or communities to build a gift angle");
  }

  return {
    interest,
    hook,
    rationale: "fallback: best available signal across text, images, and communities",
  };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function asStringArray(v: unknown): readonly string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
