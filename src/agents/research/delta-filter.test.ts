import { describe, it, expect } from "vitest";
import { filterNewPosts } from "./delta-filter";
import type { ScrapedProfile } from "./research.types";

function mkProfile(contentHashes: string[]): ScrapedProfile {
  return {
    platform: "twitter",
    url: "https://twitter.com/eddie",
    scrapedAt: "2026-04-18T00:00:00Z",
    pinnedPosts: [],
    recentPosts: contentHashes.map((h, i) => ({
      id: `p${i}`,
      platform: "twitter",
      url: `https://twitter.com/e/${i}`,
      text: `post ${i}`,
      imageUrls: [],
      postedAt: "2026-04-18T00:00:00Z",
      contentHash: h,
    })),
    linksInBio: [],
  };
}

describe("filterNewPosts", () => {
  it("returns all posts when no previous hashes", () => {
    const result = filterNewPosts([mkProfile(["a", "b"])], []);
    expect(result.filteredProfiles[0]?.recentPosts.length).toBe(2);
    expect(result.allHashes).toEqual(["a", "b"]);
  });

  it("filters previously-seen hashes", () => {
    const result = filterNewPosts([mkProfile(["a", "b", "c"])], ["a", "b"]);
    expect(result.filteredProfiles[0]?.recentPosts.map((p) => p.contentHash)).toEqual(["c"]);
    expect(result.allHashes.sort()).toEqual(["a", "b", "c"]);
  });

  it("dedupes allHashes across profiles", () => {
    const result = filterNewPosts([mkProfile(["a"]), mkProfile(["a", "b"])], []);
    expect(result.allHashes.sort()).toEqual(["a", "b"]);
  });
});
