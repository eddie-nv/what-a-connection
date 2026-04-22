import type { PersonProfile } from "../synthesis/profile.types";
import type { GiftRecommendation } from "../gifting/gift.types";
import type { OutreachNote } from "./outreach.types";
import type { SenderContext } from "../../orchestrator/pipeline.types";
import { callClaudeText, parseJsonFromClaude } from "../../integrations/claude";
import { escapeXml, escapeXmlDeep } from "../../utils/xml-escape";

const MAX_BODY_SENTENCES = 4;
const MIN_BODY_SENTENCES = 3;
const MAX_ATTEMPTS = 2;

const SYSTEM_PROMPT = `You write a short, warm outreach note to accompany a gift for a professional first-touch.

RULES:
- 3-4 sentences, no more.
- Match the recipient's communication tone from their personality profile.
- Reference something SPECIFIC and RECENT from their public posts — not generic flattery.
- Mention the gift naturally, it is not the centerpiece.
- End with a clear, LOW-PRESSURE call-to-action that ties to the sender's stated topic.
- Never mention: research, tools, AI, "automated", "system", or the process. It reads like a real person who follows their work.
- No emojis unless the recipient's own tone uses them heavily.
- No "I hope this finds you well" or other clichés.

Return JSON:
{
  "subject": string | null,
  "body": string,
  "toneMatched": string,
  "cta": string,
  "referencedInsight": string
}

"subject" null for channels that don't use subjects.
"toneMatched" is 1 sentence describing the tone you matched.
"referencedInsight" is the specific recent post/event/achievement you referenced.
Return only JSON.`;

type RawResponse = {
  readonly subject?: unknown;
  readonly body?: unknown;
  readonly toneMatched?: unknown;
  readonly cta?: unknown;
  readonly referencedInsight?: unknown;
};

export type OutreachDrafterInput = {
  readonly profile: PersonProfile;
  readonly gift: GiftRecommendation;
  readonly sender: SenderContext;
};

export async function draftOutreach(input: OutreachDrafterInput): Promise<OutreachNote> {
  const prompt = buildUserPrompt(input);
  let lastAttempt: OutreachNote | null = null;
  let lastFailReason = "";

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const attemptPrompt = attempt === 0
      ? prompt
      : `${prompt}\n\n<previous_attempt_failed>Your last note was rejected: ${escapeXml(lastFailReason)}. Write a new note that fixes this. Exactly 3-4 sentences.</previous_attempt_failed>`;

    const response = await callClaudeText({
      model: "claude-sonnet-4-6",
      maxTokens: 800,
      temperature: attempt === 0 ? 0.5 : 0.65,
      system: SYSTEM_PROMPT,
      userPrompt: attemptPrompt,
    });

    const parsed = parseJsonFromClaude<RawResponse>(response.text);
    const body = enforceLength(asString(parsed.body));

    const note: OutreachNote = {
      subject: typeof parsed.subject === "string" && parsed.subject.length > 0 ? parsed.subject : undefined,
      body,
      toneMatched: asString(parsed.toneMatched),
      cta: asString(parsed.cta),
      referencedGiftRank: input.gift.rank,
      referencedInsight: asString(parsed.referencedInsight),
      characterCount: body.length,
    };

    if (isUsableNote(note)) return note;

    lastAttempt = note;
    lastFailReason = describeUsability(note);
  }

  throw new Error(`draftOutreach: no usable note after ${MAX_ATTEMPTS} attempts. Last issue: ${lastFailReason || "unknown"}${lastAttempt ? ` (body="${lastAttempt.body.slice(0, 120)}")` : ""}`);
}

function describeUsability(note: OutreachNote): string {
  const sentenceCount = note.body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
  const issues: string[] = [];
  if (note.body.length < 50) issues.push(`body too short (${note.body.length} chars)`);
  if (note.body.length > 800) issues.push(`body too long (${note.body.length} chars)`);
  if (sentenceCount < MIN_BODY_SENTENCES) issues.push(`only ${sentenceCount} sentences (need ${MIN_BODY_SENTENCES})`);
  if (sentenceCount > MAX_BODY_SENTENCES) issues.push(`${sentenceCount} sentences (max ${MAX_BODY_SENTENCES})`);
  if (!note.cta) issues.push("missing CTA");
  if (!note.referencedInsight) issues.push("missing referencedInsight");
  return issues.join("; ");
}

function buildUserPrompt(input: OutreachDrafterInput): string {
  const { profile, gift, sender } = input;
  return [
    `<sender>
  Name: ${escapeXml(sender.name)}
  Role: ${escapeXml(sender.role ?? "(not given)")}
  Company: ${escapeXml(sender.company ?? "(not given)")}
  Reason to connect: ${escapeXml(sender.reasonForConnecting)}
  Topic to discuss: ${escapeXml(sender.discussionTopic)}
</sender>`,
    `<recipient_tone>${JSON.stringify(escapeXmlDeep(profile.personality))}</recipient_tone>`,
    `<recent_hooks>${JSON.stringify(escapeXmlDeep(profile.recentHooks.slice(0, 5)))}</recent_hooks>`,
    `<best_gift_angle>${JSON.stringify(escapeXmlDeep(profile.bestGiftAngle))}</best_gift_angle>`,
    `<gift>
  Name: ${escapeXml(gift.name)}
  Description: ${escapeXml(gift.description)}
  Conversation opener: ${escapeXml(gift.conversationOpener)}
</gift>`,
    `<avoid_topics>${JSON.stringify(escapeXmlDeep(profile.avoidTopics))}</avoid_topics>`,
  ].join("\n");
}

function enforceLength(body: string): string {
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (sentences.length <= MAX_BODY_SENTENCES) return body.trim();
  return sentences.slice(0, MAX_BODY_SENTENCES).join(" ");
}

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export function isUsableNote(note: OutreachNote): boolean {
  const sentenceCount = note.body.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0).length;
  return (
    note.body.length >= 50 &&
    note.body.length <= 800 &&
    sentenceCount >= MIN_BODY_SENTENCES &&
    sentenceCount <= MAX_BODY_SENTENCES &&
    note.cta.length > 0 &&
    note.referencedInsight.length > 0
  );
}
