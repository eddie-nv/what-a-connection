import { describe, it, expect } from "vitest";
import { sha256, hashPost, diffHashes } from "./hash";

describe("hash", () => {
  it("sha256 is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).not.toBe(sha256("world"));
  });

  it("hashPost normalizes whitespace and case", () => {
    expect(hashPost("Hello  World", "url")).toBe(hashPost("hello world", "url"));
  });

  it("hashPost differentiates by url", () => {
    expect(hashPost("same", "url1")).not.toBe(hashPost("same", "url2"));
  });

  it("diffHashes reports added and removed", () => {
    const diff = diffHashes(["a", "b"], ["b", "c"]);
    expect(diff.added).toEqual(["c"]);
    expect(diff.removed).toEqual(["a"]);
  });

  it("diffHashes handles empty inputs", () => {
    expect(diffHashes([], [])).toEqual({ added: [], removed: [] });
    expect(diffHashes(["a"], [])).toEqual({ added: [], removed: ["a"] });
  });
});
