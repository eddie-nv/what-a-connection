import { describe, it, expect } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves order of results", async () => {
    const items = [1, 2, 3, 4, 5];
    const promises = mapWithConcurrency(items, 2, async (n) => n * 10);
    const results = await Promise.all(promises);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("never exceeds concurrency limit", async () => {
    let active = 0;
    let maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6];
    const promises = mapWithConcurrency(items, 2, async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 10));
      active--;
    });
    await Promise.all(promises);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("handles empty array", async () => {
    const results = await Promise.all(mapWithConcurrency([], 5, async (x) => x));
    expect(results).toEqual([]);
  });
});
