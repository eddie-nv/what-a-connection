import { describe, it, expect } from "vitest";
import { ResearchQueue } from "./research-queue";

describe("ResearchQueue", () => {
  it("dedupes visited URLs (ignoring trailing slashes + case)", () => {
    const q = new ResearchQueue();
    expect(q.enqueue("https://twitter.com/eddie", "twitter")).toBe(true);
    expect(q.enqueue("https://TWITTER.COM/eddie/", "twitter")).toBe(false);
    expect(q.size()).toBe(1);
  });

  it("respects max depth", () => {
    const q = new ResearchQueue(1);
    expect(q.enqueue("https://example.com/a", "website", undefined, 0)).toBe(true);
    expect(q.enqueue("https://example.com/b", "website", undefined, 1)).toBe(true);
    expect(q.enqueue("https://example.com/c", "website", undefined, 2)).toBe(false);
  });

  it("drain returns and clears pending", () => {
    const q = new ResearchQueue();
    q.enqueue("https://a.com", "website");
    q.enqueue("https://b.com", "website");
    const drained = q.drain();
    expect(drained.length).toBe(2);
    expect(q.size()).toBe(0);
  });

  it("rejects invalid URLs", () => {
    const q = new ResearchQueue();
    expect(q.enqueue("not a url", "website")).toBe(false);
  });
});
