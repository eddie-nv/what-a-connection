import type { Platform } from "../../orchestrator/pipeline.types";
import type { ResearchQueueItem } from "./research.types";
import { normalize } from "./link-extractor";

export class ResearchQueue {
  private readonly pending: ResearchQueueItem[] = [];
  private readonly visited = new Set<string>();
  private readonly maxDepth: number;

  constructor(maxDepth = 2) {
    this.maxDepth = maxDepth;
  }

  enqueue(url: string, platform: Platform, sourceUrl?: string, depth = 0): boolean {
    const normalized = normalize(url);
    if (!normalized) return false;
    if (this.visited.has(normalized)) return false;
    if (depth > this.maxDepth) return false;
    this.visited.add(normalized);
    this.pending.push({ url: normalized, platform, sourceUrl, depth });
    return true;
  }

  drain(): readonly ResearchQueueItem[] {
    const items = this.pending.splice(0, this.pending.length);
    return items;
  }

  size(): number {
    return this.pending.length;
  }

  visitedCount(): number {
    return this.visited.size;
  }

  hasVisited(url: string): boolean {
    return this.visited.has(normalize(url));
  }
}
