import type { Platform } from "../../orchestrator/pipeline.types";
import type { ScrapedProfile } from "./research.types";
import { detectPlatform } from "../../integrations/apify";

const URL_REGEX = /\bhttps?:\/\/[^\s<>"')]+/gi;
const HANDLE_PATTERNS: readonly { re: RegExp; build: (handle: string) => string; platform: Platform }[] = [
  {
    re: /(?:^|\s)@([a-z0-9_]{2,30})\s+on\s+twitter/gi,
    build: (h) => `https://twitter.com/${h}`,
    platform: "twitter",
  },
  {
    re: /(?:^|\s)ig:?\s*@?([a-z0-9._]{2,30})/gi,
    build: (h) => `https://instagram.com/${h}`,
    platform: "instagram",
  },
  {
    re: /(?:^|\s)gh:?\s*@?([a-z0-9-]{2,39})/gi,
    build: (h) => `https://github.com/${h}`,
    platform: "github",
  },
];

export type ExtractedLink = {
  readonly url: string;
  readonly platform: Platform;
  readonly sourceUrl: string;
};

export function extractLinks(profile: ScrapedProfile): readonly ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const texts: string[] = [];

  if (profile.bio) texts.push(profile.bio);
  for (const url of profile.linksInBio) links.push({ url, platform: detectPlatform(url), sourceUrl: profile.url });
  for (const post of profile.pinnedPosts) texts.push(post.text);
  for (const post of profile.recentPosts.slice(0, 20)) texts.push(post.text);

  for (const text of texts) {
    for (const match of text.matchAll(URL_REGEX)) {
      const raw = match[0].replace(/[.,;:!?)]+$/, "");
      links.push({ url: raw, platform: detectPlatform(raw), sourceUrl: profile.url });
    }
    for (const { re, build, platform } of HANDLE_PATTERNS) {
      for (const match of text.matchAll(re)) {
        const handle = match[1];
        if (handle) links.push({ url: build(handle), platform, sourceUrl: profile.url });
      }
    }
  }

  return dedupeByNormalizedUrl(links);
}

function dedupeByNormalizedUrl(links: readonly ExtractedLink[]): readonly ExtractedLink[] {
  const seen = new Set<string>();
  const out: ExtractedLink[] = [];
  for (const l of links) {
    const key = normalize(l.url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...l, url: key });
  }
  return out;
}

export function normalize(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return "";
  }
}
