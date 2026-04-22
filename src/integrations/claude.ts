import Anthropic from "@anthropic-ai/sdk";
import type {
  ClaudeTextRequest,
  ClaudeVisionRequest,
  ClaudeResponse,
} from "./claude.types";
import { withRetry } from "../utils/retry";
import { requireSecret } from "../utils/env";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireSecret("ANTHROPIC_API_KEY") });
  }
  return client;
}

export async function callClaudeText(req: ClaudeTextRequest): Promise<ClaudeResponse> {
  const started = performance.now();
  const response = await withRetry(() =>
    getClient().messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      temperature: req.temperature ?? 0.2,
      system: req.system,
      messages: [{ role: "user", content: req.userPrompt }],
    }),
  );
  return buildResponse(response, started);
}

export async function callClaudeVision(req: ClaudeVisionRequest): Promise<ClaudeResponse> {
  const started = performance.now();
  const safeImages = req.images.filter((img) => isSafePublicHttpsUrl(img.url));
  if (safeImages.length === 0) {
    throw new Error("No safe image URLs to send (all rejected by SSRF guard)");
  }
  const imageBlocks = safeImages.map((img) => ({
    type: "image" as const,
    source: {
      type: "url" as const,
      url: img.url,
    },
  }));
  const response = await withRetry(() =>
    getClient().messages.create({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [
        {
          role: "user",
          content: [...imageBlocks, { type: "text", text: req.userPrompt }],
        },
      ],
    }),
  );
  return buildResponse(response, started);
}

function buildResponse(
  response: Anthropic.Messages.Message,
  started: number,
): ClaudeResponse {
  const text = response.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    durationMs: Math.round(performance.now() - started),
  };
}

const MAX_JSON_BYTES = 1_000_000;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export function parseJsonFromClaude<T>(text: string): T {
  if (text.length > MAX_JSON_BYTES) {
    throw new Error(`Claude response exceeds max JSON size (${text.length} > ${MAX_JSON_BYTES})`);
  }
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fencedMatch?.[1]?.trim() ?? text.trim();
  const parsed = JSON.parse(candidate) as unknown;
  return scrubPollutedKeys(parsed) as T;
}

export function isSafePublicHttpsUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (host === "metadata.google.internal") return false;
  if (isPrivateIp(host)) return false;
  return true;
}

function isPrivateIp(host: string): boolean {
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1, 5).map(Number);
    const a = parts[0] ?? 0;
    const b = parts[1] ?? 0;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
    return false;
  }
  if (host === "::1" || host === "::" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) {
    return true;
  }
  return false;
}

function scrubPollutedKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPollutedKeys);
  if (value === null || typeof value !== "object") return value;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    clean[k] = scrubPollutedKeys(v);
  }
  return clean;
}
