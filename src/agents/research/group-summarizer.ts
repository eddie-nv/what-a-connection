import type { DiscoveredGroup, GroupResearch } from "./research.types";
import type { GroupSummaryResponse } from "./group-summarizer.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";

const MAX_TEXT_CHARS = 15_000;

const SYSTEM_PROMPT = `You analyze a group/club/community's public description to explain why it matters for gift selection.

Return JSON matching this TypeScript type:
{
  "summary": string,        // 1-2 sentences: what is this group
  "culture": string,        // 1-2 sentences: values, tone, rituals
  "notableMembers": string[], // known public figures or leaders if any
  "giftRelevance": string   // 1-2 sentences: what a member would appreciate as a conversation-starter
}

Return only JSON. No prose outside JSON.`;

export type SummarizeGroupInput = {
  readonly group: DiscoveredGroup;
  readonly scrapedText: string;
  readonly prospectName: string;
};

export async function summarizeGroup(input: SummarizeGroupInput): Promise<GroupResearch> {
  const truncated = input.scrapedText.slice(0, MAX_TEXT_CHARS);
  const userPrompt = `Prospect is a member of "${input.group.name}" (${input.group.type}).
Summarize this group's public material for the purpose of gift selection.

<group_name>${input.group.name}</group_name>
<group_type>${input.group.type}</group_type>
<prospect_name>${input.prospectName}</prospect_name>

<group_website_content>
${truncated}
</group_website_content>`;

  const response = await callClaudeText({
    model: "claude-sonnet-4-6",
    maxTokens: 800,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    userPrompt,
  });

  const parsed = parseJsonFromClaude<GroupSummaryResponse>(response.text);
  return {
    group: input.group,
    summary: asString(parsed.summary),
    culture: asString(parsed.culture),
    notableMembers: Array.isArray(parsed.notableMembers)
      ? parsed.notableMembers.filter((m): m is string => typeof m === "string")
      : [],
    giftRelevance: asString(parsed.giftRelevance),
  };
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
