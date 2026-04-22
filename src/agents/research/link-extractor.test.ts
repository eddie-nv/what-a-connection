import { describe, it, expect } from "vitest";
import { extractLinks, normalize } from "./link-extractor";
import type { ScrapedProfile } from "./research.types";

function profile(over: Partial<ScrapedProfile> = {}): ScrapedProfile {
  return {
    platform: "twitter",
    url: "https://twitter.com/eddie",
    scrapedAt: "2026-04-18T00:00:00Z",
    pinnedPosts: [],
    recentPosts: [],
    linksInBio: [],
    ...over,
  };
}

describe("normalize", () => {
  it("lowercases host and strips trailing slash", () => {
    expect(normalize("https://GitHub.com/foo/")).toBe("https://github.com/foo");
  });

  it("returns empty string for invalid URLs", () => {
    expect(normalize("not a url")).toBe("");
  });
});

describe("extractLinks", () => {
  it("extracts links from bio", () => {
    const links = extractLinks(profile({ bio: "Find me at https://github.com/eddie" }));
    expect(links.map((l) => l.url)).toContain("https://github.com/eddie");
  });

  it("extracts handle patterns", () => {
    const links = extractLinks(profile({ bio: "Also @someone on twitter" }));
    expect(links.some((l) => l.platform === "twitter" && l.url.includes("someone"))).toBe(true);
  });

  it("pulls in linksInBio", () => {
    const links = extractLinks(profile({ linksInBio: ["https://example.com/me"] }));
    expect(links.some((l) => l.url === "https://example.com/me")).toBe(true);
  });

  it("dedupes by normalized url", () => {
    const links = extractLinks(
      profile({
        bio: "https://x.com/a https://X.COM/a/",
      }),
    );
    const xCount = links.filter((l) => l.url.includes("x.com/a")).length;
    expect(xCount).toBe(1);
  });
});
