import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DossierCache, normalizeUrl } from "./cache";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PipelineOutput } from "../orchestrator/pipeline.types";

function mkOutput(over: Partial<PipelineOutput> = {}): PipelineOutput {
  return {
    input: {
      prospectUrl: "https://twitter.com/eddie",
      sender: {
        name: "Ann",
        reasonForConnecting: "chat",
        discussionTopic: "coffee",
      },
    },
    cached: false,
    profiles: [],
    discoveredGroups: [],
    groupResearch: [],
    imageAnalysis: null,
    textAnalysis: null,
    personProfile: null,
    gifts: [],
    outreach: null,
    failures: [],
    totalDurationMs: 0,
    completedAt: new Date().toISOString(),
    ...over,
  };
}

describe("DossierCache", () => {
  let dir: string;
  let cache: DossierCache;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wac-cache-"));
    cache = new DossierCache(join(dir, "test.sqlite"), 7);
  });

  afterEach(() => {
    cache.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns miss with empty previousHashes when nothing stored", () => {
    const result = cache.lookup("https://twitter.com/eddie");
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.previousHashes).toEqual([]);
  });

  it("write + lookup round-trips data", () => {
    cache.write("https://twitter.com/eddie", mkOutput(), ["h1", "h2"]);
    const result = cache.lookup("https://twitter.com/eddie");
    expect(result.hit).toBe(true);
    if (result.hit) {
      expect(result.dossier.contentHashes).toEqual(["h1", "h2"]);
    }
  });

  it("returns previous hashes on miss after expiry force-refresh", () => {
    cache.write("https://twitter.com/eddie", mkOutput(), ["h1"]);
    const result = cache.lookup("https://twitter.com/eddie", true);
    expect(result.hit).toBe(false);
    if (!result.hit) expect(result.previousHashes).toEqual(["h1"]);
  });

  it("normalizes URL for keys", () => {
    cache.write("https://twitter.com/eddie/", mkOutput(), ["h1"]);
    const result = cache.lookup("https://TWITTER.com/eddie");
    expect(result.hit).toBe(true);
  });
});

describe("normalizeUrl", () => {
  it("lowercases hostname", () => {
    expect(normalizeUrl("https://GitHub.com/foo")).toBe("https://github.com/foo");
  });

  it("strips trailing slash", () => {
    expect(normalizeUrl("https://example.com/a/")).toBe("https://example.com/a");
  });
});
