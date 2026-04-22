import type { ScrapedProfile, ScrapedPost } from "./research.types";

export type DeltaFilterResult = {
  readonly filteredProfiles: readonly ScrapedProfile[];
  readonly allHashes: readonly string[];
};

type FilteredPosts = {
  readonly posts: readonly ScrapedPost[];
  readonly hashes: readonly string[];
};

export function filterNewPosts(
  profiles: readonly ScrapedProfile[],
  previousHashes: readonly string[],
): DeltaFilterResult {
  const prev = new Set(previousHashes);
  const allHashes: string[] = [];

  const filteredProfiles = profiles.map((profile) => {
    const pinned = filterPosts(profile.pinnedPosts, prev);
    const recent = filterPosts(profile.recentPosts, prev);
    allHashes.push(...pinned.hashes, ...recent.hashes);
    return {
      ...profile,
      pinnedPosts: pinned.posts,
      recentPosts: recent.posts,
    };
  });

  return { filteredProfiles, allHashes: Array.from(new Set(allHashes)) };
}

function filterPosts(posts: readonly ScrapedPost[], previous: ReadonlySet<string>): FilteredPosts {
  const kept: ScrapedPost[] = [];
  const hashes: string[] = [];
  for (const post of posts) {
    hashes.push(post.contentHash);
    if (!previous.has(post.contentHash)) kept.push(post);
  }
  return { posts: kept, hashes };
}
