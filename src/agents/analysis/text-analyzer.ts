import type { ScrapedProfile } from "../research/research.types";
import type {
  Achievement,
  CommunityAffiliation,
  EvidenceExcerpt,
  Interest,
  InterestDepth,
  PersonalityProfile,
  RecentHook,
  TextAnalysis,
} from "./text.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";

const MAX_CORPUS_CHARS = 40_000;
const DEPTHS: ReadonlySet<InterestDepth> = new Set(["passing", "moderate", "passionate"]);
const ACHIEVEMENT_CATEGORIES: ReadonlySet<Achievement["category"]> = new Set([
  "launch", "funding", "promotion", "race", "certification", "milestone", "other",
]);
const ROLES: ReadonlySet<CommunityAffiliation["role"]> = new Set([
  "member", "leader", "organizer", "participant", "unknown",
]);
const ACTIVITY: ReadonlySet<CommunityAffiliation["activityLevel"]> = new Set(["high", "moderate", "low"]);

const SYSTEM_PROMPT = `You analyze a person's public social media posts to surface conversation hooks for a professional first-touch gift.

For every claim you make, cite the source post URL and excerpt. Do NOT fabricate.

Return JSON:
{
  "interests": Array<{
    "topic": string,
    "mentionCount": number,
    "mostRecentMention": string,
    "depth": "passing" | "moderate" | "passionate",
    "evidence": Array<{"text": string, "sourcePostUrl": string, "postedAt": string}>
  }>,
  "achievements": Array<{
    "title": string,
    "date": string,
    "category": "launch" | "funding" | "promotion" | "race" | "certification" | "milestone" | "other",
    "sourcePostUrl": string
  }>,
  "recentHooks": Array<{
    "summary": string,
    "date": string,
    "sourcePostUrl": string,
    "conversationPotential": number
  }>,
  "personality": {
    "tone": string[],
    "values": string[],
    "communicationStyle": string
  },
  "careerNarrative": string,
  "communities": Array<{
    "name": string,
    "role": "member" | "leader" | "organizer" | "participant" | "unknown",
    "activityLevel": "high" | "moderate" | "low",
    "signals": string[]
  }>
}

"recentHooks" = things from the last 2 weeks useful as a message opener.
"conversationPotential" 0.0-1.0.
Return only JSON, no prose.`;

type RawInterest = {
  readonly topic?: unknown;
  readonly mentionCount?: unknown;
  readonly mostRecentMention?: unknown;
  readonly depth?: unknown;
  readonly evidence?: unknown;
};

type RawResponse = {
  readonly interests?: readonly RawInterest[];
  readonly achievements?: readonly Record<string, unknown>[];
  readonly recentHooks?: readonly Record<string, unknown>[];
  readonly personality?: Record<string, unknown>;
  readonly careerNarrative?: unknown;
  readonly communities?: readonly Record<string, unknown>[];
};

export async function analyzeText(profiles: readonly ScrapedProfile[]): Promise<TextAnalysis> {
  const corpus = buildCorpus(profiles);
  if (!corpus.content) return emptyAnalysis(0);

  const response = await callClaudeText({
    model: "claude-sonnet-4-6",
    maxTokens: 4000,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    userPrompt: `Analyze these posts.\n\n<posts>\n${corpus.content}\n</posts>`,
  });

  const parsed = parseJsonFromClaude<RawResponse>(response.text);
  return {
    interests: (parsed.interests ?? []).map(normalizeInterest).filter((i): i is Interest => i !== null),
    achievements: (parsed.achievements ?? [])
      .map(normalizeAchievement)
      .filter((a): a is Achievement => a !== null),
    recentHooks: (parsed.recentHooks ?? [])
      .map(normalizeRecentHook)
      .filter((h): h is RecentHook => h !== null),
    personality: normalizePersonality(parsed.personality),
    careerNarrative: typeof parsed.careerNarrative === "string" ? parsed.careerNarrative : "",
    communities: (parsed.communities ?? [])
      .map(normalizeCommunity)
      .filter((c): c is CommunityAffiliation => c !== null),
    totalPostsAnalyzed: corpus.postCount,
  };
}

function buildCorpus(profiles: readonly ScrapedProfile[]): { content: string; postCount: number } {
  const entries: { text: string; postedAt: string }[] = [];

  for (const profile of profiles) {
    if (profile.bio) {
      entries.push({ text: `[${profile.platform} bio] ${profile.bio}`, postedAt: profile.scrapedAt });
    }
    for (const post of profile.pinnedPosts) {
      entries.push({
        text: `[${profile.platform} PINNED @ ${post.postedAt} @ ${post.url}] ${post.text}`,
        postedAt: post.postedAt,
      });
    }
    for (const post of profile.recentPosts) {
      entries.push({
        text: `[${profile.platform} @ ${post.postedAt} @ ${post.url}] ${post.text}`,
        postedAt: post.postedAt,
      });
    }
  }

  entries.sort((a, b) => b.postedAt.localeCompare(a.postedAt));

  const lines: string[] = [];
  let used = 0;
  let count = 0;
  for (const entry of entries) {
    if (used + entry.text.length > MAX_CORPUS_CHARS) break;
    lines.push(entry.text);
    used += entry.text.length;
    count++;
  }

  return { content: lines.join("\n---\n"), postCount: count };
}

function normalizeInterest(raw: RawInterest): Interest | null {
  const topic = asString(raw.topic);
  if (!topic) return null;
  const depth: InterestDepth = DEPTHS.has(raw.depth as InterestDepth)
    ? (raw.depth as InterestDepth)
    : "passing";
  const evidence = Array.isArray(raw.evidence)
    ? (raw.evidence as unknown[]).map(normalizeEvidence).filter((e): e is EvidenceExcerpt => e !== null)
    : [];
  return {
    topic,
    mentionCount: asNumber(raw.mentionCount, 0),
    mostRecentMention: asString(raw.mostRecentMention),
    depth,
    evidence,
  };
}

function normalizeEvidence(raw: unknown): EvidenceExcerpt | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const text = asString(obj.text);
  const sourcePostUrl = asString(obj.sourcePostUrl);
  if (!text || !sourcePostUrl) return null;
  return { text, sourcePostUrl, postedAt: asString(obj.postedAt) };
}

function normalizeAchievement(raw: Record<string, unknown>): Achievement | null {
  const title = asString(raw.title);
  const sourcePostUrl = asString(raw.sourcePostUrl);
  if (!title || !sourcePostUrl) return null;
  const category = ACHIEVEMENT_CATEGORIES.has(raw.category as Achievement["category"])
    ? (raw.category as Achievement["category"])
    : "other";
  return { title, date: asString(raw.date), category, sourcePostUrl };
}

function normalizeRecentHook(raw: Record<string, unknown>): RecentHook | null {
  const summary = asString(raw.summary);
  const sourcePostUrl = asString(raw.sourcePostUrl);
  if (!summary || !sourcePostUrl) return null;
  const potential = asNumber(raw.conversationPotential, 0);
  return {
    summary,
    date: asString(raw.date),
    sourcePostUrl,
    conversationPotential: Math.max(0, Math.min(1, potential)),
  };
}

function normalizePersonality(raw: Record<string, unknown> | undefined): PersonalityProfile {
  if (!raw) return { tone: [], values: [], communicationStyle: "" };
  return {
    tone: asStringArray(raw.tone),
    values: asStringArray(raw.values),
    communicationStyle: asString(raw.communicationStyle),
  };
}

function normalizeCommunity(raw: Record<string, unknown>): CommunityAffiliation | null {
  const name = asString(raw.name);
  if (!name) return null;
  const role = ROLES.has(raw.role as CommunityAffiliation["role"])
    ? (raw.role as CommunityAffiliation["role"])
    : "unknown";
  const activityLevel = ACTIVITY.has(raw.activityLevel as CommunityAffiliation["activityLevel"])
    ? (raw.activityLevel as CommunityAffiliation["activityLevel"])
    : "low";
  return {
    name,
    role,
    activityLevel,
    signals: asStringArray(raw.signals),
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

function emptyAnalysis(postCount: number): TextAnalysis {
  return {
    interests: [],
    achievements: [],
    recentHooks: [],
    personality: { tone: [], values: [], communicationStyle: "" },
    careerNarrative: "",
    communities: [],
    totalPostsAnalyzed: postCount,
  };
}
