import type { PersonProfile } from "../synthesis/profile.types";
import type { GroupResearch } from "../research/research.types";
import type { GiftCitation, GiftRecommendation } from "./gift.types";
import type { SenderContext } from "../../orchestrator/pipeline.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";
import { evaluateCreepiness } from "../../guardrails/creepiness";
import { escapeXml, escapeXmlDeep } from "../../utils/xml-escape";

const MAX_ATTEMPTS = 3;
const TARGET_COUNT = 3;

const SYSTEM_PROMPT = `You recommend 3 gifts designed to spark a professional conversation.

OPTIMIZATION TARGET: which gift maximizes the chance the recipient wants to talk to the sender?

RULES (hard):
- Gifts must be specific and purchasable. "Fellow Stagg EKG kettle, matte black" NOT "something coffee-related".
- Every gift must cite back to posts, images, or communities that inspired it.
- Every gift must come with a natural conversation opener — the segue from gift to meeting.
- NO clothing, jewelry, perfume, skincare/health/beauty, appearance-related items.
- NO references to clearly private info (family, health, politics, religion, financial).
- NO hyper-niche items that would reveal surveillance.
- Avoid items over $200 (bribery risk).

Note: an independent creepiness guardrail runs on your output. Do not self-score leniently to pass it; be honest. Aim genuinely for 1-2.

Return JSON:
{
  "gifts": Array<{
    "name": string,
    "description": string,
    "estimatedPriceUsd": number,
    "whereToBuy": string,
    "citations": Array<{
      "type": "post" | "image" | "community" | "achievement",
      "sourceUrl": string,
      "excerpt": string
    }>,
    "conversationOpener": string,
    "creepinessScore": number,
    "rank": 1 | 2 | 3
  }>
}

Exactly 3 gifts, ranked 1 (best) to 3.
Return only JSON.`;

type RawGift = {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly estimatedPriceUsd?: unknown;
  readonly whereToBuy?: unknown;
  readonly citations?: unknown;
  readonly conversationOpener?: unknown;
  readonly creepinessScore?: unknown;
  readonly rank?: unknown;
};

type RawResponse = {
  readonly gifts?: readonly RawGift[];
};

const VALID_CITATION_TYPES: ReadonlySet<GiftCitation["type"]> = new Set(["post", "image", "community", "achievement"]);

export type GiftRecommenderInput = {
  readonly profile: PersonProfile;
  readonly sender: SenderContext;
  readonly groupResearch: readonly GroupResearch[];
};

export async function recommendGifts(input: GiftRecommenderInput): Promise<readonly GiftRecommendation[]> {
  const context = buildUserPrompt(input);
  const accepted: GiftRecommendation[] = [];
  const acceptedNames = new Set<string>();
  const rejectedReasons: string[] = [];
  const seenGiftNames = new Set<string>();

  for (let attempt = 0; attempt < MAX_ATTEMPTS && accepted.length < TARGET_COUNT; attempt++) {
    const prompt = attempt === 0
      ? context
      : `${context}\n\n<previous_rejections>Earlier attempts were rejected for: ${escapeXml(rejectedReasons.join("; "))}. Pick DIFFERENT gifts that avoid these issues. Do NOT repeat: ${escapeXml(Array.from(seenGiftNames).join(", "))}.</previous_rejections>`;

    const response = await callClaudeText({
      model: "claude-sonnet-4-6",
      maxTokens: 3000,
      temperature: attempt === 0 ? 0.4 : 0.6,
      system: SYSTEM_PROMPT,
      userPrompt: prompt,
    });

    const parsed = parseJsonFromClaude<RawResponse>(response.text);
    for (const raw of parsed.gifts ?? []) {
      if (accepted.length >= TARGET_COUNT) break;
      const gift = normalizeGift(raw, accepted.length + 1);
      if (!gift) continue;
      const nameKey = gift.name.toLowerCase().trim();
      seenGiftNames.add(gift.name);
      if (acceptedNames.has(nameKey)) continue;
      const evaluation = evaluateCreepiness(gift);
      if (evaluation.passed) {
        accepted.push({ ...gift, creepinessScore: evaluation.score });
        acceptedNames.add(nameKey);
      } else {
        rejectedReasons.push(`"${gift.name}" — ${evaluation.flagged.join(",")}: ${evaluation.notes}`);
      }
    }
  }

  if (accepted.length === 0) {
    const reasons = rejectedReasons.length > 0 ? rejectedReasons.join(" | ") : "no gifts returned by model";
    throw new Error(`recommendGifts: no acceptable gifts after ${MAX_ATTEMPTS} attempts. Reasons: ${reasons}`);
  }

  return accepted;
}

function buildUserPrompt(input: GiftRecommenderInput): string {
  const { profile, sender, groupResearch } = input;
  const sections: string[] = [];
  sections.push(`<sender>
  Name: ${escapeXml(sender.name)}
  Role: ${escapeXml(sender.role ?? "(not given)")}
  Company: ${escapeXml(sender.company ?? "(not given)")}
  Reason to connect: ${escapeXml(sender.reasonForConnecting)}
  Topic to discuss: ${escapeXml(sender.discussionTopic)}
</sender>`);
  sections.push(`<recipient_profile>${JSON.stringify(escapeXmlDeep(profile))}</recipient_profile>`);
  if (groupResearch.length > 0) {
    sections.push(`<group_research>${JSON.stringify(escapeXmlDeep(groupResearch))}</group_research>`);
  }
  return sections.join("\n");
}

function normalizeGift(raw: RawGift, defaultRank: number): GiftRecommendation | null {
  const name = asString(raw.name);
  if (!name) return null;
  const rank = coerceRank(raw.rank, defaultRank);
  return {
    name,
    description: asString(raw.description),
    estimatedPriceUsd: asNumber(raw.estimatedPriceUsd, 0),
    whereToBuy: asString(raw.whereToBuy),
    citations: normalizeCitations(raw.citations),
    conversationOpener: asString(raw.conversationOpener),
    creepinessScore: asNumber(raw.creepinessScore, 5),
    rank,
  };
}

function normalizeCitations(raw: unknown): readonly GiftCitation[] {
  if (!Array.isArray(raw)) return [];
  const out: GiftCitation[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const obj = c as Record<string, unknown>;
    const type = VALID_CITATION_TYPES.has(obj.type as GiftCitation["type"])
      ? (obj.type as GiftCitation["type"])
      : "post";
    out.push({
      type,
      sourceUrl: asString(obj.sourceUrl),
      excerpt: asString(obj.excerpt),
    });
  }
  return out;
}

function coerceRank(v: unknown, fallback: number): 1 | 2 | 3 {
  if (v === 1 || v === 2 || v === 3) return v;
  if (fallback === 1 || fallback === 2 || fallback === 3) return fallback;
  return 3;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
