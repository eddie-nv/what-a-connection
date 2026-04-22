import type { DiscoveredGroup, ScrapedProfile } from "./research.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";

const MAX_POST_CHARS = 12_000;

const SYSTEM_PROMPT = `You identify clubs, communities, and organizations that a person is part of, based on their social posts.

You only extract groups mentioned explicitly by name. Do not invent affiliations.

Types you recognize:
- club, community, meetup, conference, cohort, accelerator, organization,
  sports_club, hobby_group, volunteer_org, discord, slack, other

Return JSON matching this TypeScript type:
{
  "groups": Array<{
    "name": string,
    "type": "club" | "community" | "meetup" | "conference" | "cohort" | "accelerator" | "organization" | "sports_club" | "hobby_group" | "volunteer_org" | "discord" | "slack" | "other",
    "url": string | null,
    "mentionedIn": string[],
    "confidence": number
  }>
}

"mentionedIn" contains short excerpts (one sentence each) from posts that reference the group.
"confidence" is 0.0-1.0.
Return only JSON, no prose.`;

type ClubDetectionResponse = {
  readonly groups: ReadonlyArray<{
    readonly name: string;
    readonly type: DiscoveredGroup["type"];
    readonly url: string | null;
    readonly mentionedIn: readonly string[];
    readonly confidence: number;
  }>;
};

export async function detectGroups(
  profiles: readonly ScrapedProfile[],
): Promise<readonly DiscoveredGroup[]> {
  const corpus = buildCorpus(profiles);
  if (corpus.length === 0) return [];

  const response = await callClaudeText({
    model: "claude-sonnet-4-6",
    maxTokens: 2000,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    userPrompt: `Identify clubs and communities referenced in these posts.\n\n<posts>\n${corpus}\n</posts>`,
  });

  const parsed = parseJsonFromClaude<ClubDetectionResponse>(response.text);
  return parsed.groups
    .filter((g) => typeof g.name === "string" && g.name.length > 0)
    .map((g) => ({
      name: g.name,
      type: g.type,
      url: g.url ?? undefined,
      mentionedIn: g.mentionedIn ?? [],
      confidence: clamp01(g.confidence),
    }));
}

function buildCorpus(profiles: readonly ScrapedProfile[]): string {
  const lines: string[] = [];
  let used = 0;
  for (const profile of profiles) {
    if (profile.bio) {
      const entry = `[${profile.platform} bio] ${profile.bio}`;
      if (used + entry.length > MAX_POST_CHARS) break;
      lines.push(entry);
      used += entry.length;
    }
    for (const post of profile.recentPosts) {
      const entry = `[${profile.platform}] ${post.text}`;
      if (used + entry.length > MAX_POST_CHARS) break;
      lines.push(entry);
      used += entry.length;
    }
    if (used >= MAX_POST_CHARS) break;
  }
  return lines.join("\n---\n");
}

function clamp01(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
