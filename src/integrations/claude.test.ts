import { describe, it, expect } from "vitest";
import { isSafePublicHttpsUrl, parseJsonFromClaude } from "./claude";

describe("isSafePublicHttpsUrl", () => {
  it("accepts https public URLs", () => {
    expect(isSafePublicHttpsUrl("https://example.com/image.png")).toBe(true);
  });

  it("rejects http", () => {
    expect(isSafePublicHttpsUrl("http://example.com/a")).toBe(false);
  });

  it("rejects localhost and loopback", () => {
    expect(isSafePublicHttpsUrl("https://localhost/")).toBe(false);
    expect(isSafePublicHttpsUrl("https://127.0.0.1/")).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    expect(isSafePublicHttpsUrl("https://10.0.0.1/")).toBe(false);
    expect(isSafePublicHttpsUrl("https://192.168.1.1/")).toBe(false);
    expect(isSafePublicHttpsUrl("https://172.16.0.1/")).toBe(false);
  });

  it("rejects link-local and metadata", () => {
    expect(isSafePublicHttpsUrl("https://169.254.169.254/")).toBe(false);
    expect(isSafePublicHttpsUrl("https://metadata.google.internal/")).toBe(false);
  });

  it("rejects invalid URLs", () => {
    expect(isSafePublicHttpsUrl("not a url")).toBe(false);
  });
});

describe("parseJsonFromClaude", () => {
  it("parses fenced JSON", () => {
    const text = "prose\n```json\n{\"a\": 1}\n```\ntail";
    expect(parseJsonFromClaude<{ a: number }>(text)).toEqual({ a: 1 });
  });

  it("parses raw JSON", () => {
    expect(parseJsonFromClaude<{ b: string }>('{"b": "x"}')).toEqual({ b: "x" });
  });

  it("strips __proto__ and constructor keys", () => {
    const text = '{"safe": 1, "__proto__": {"polluted": true}, "constructor": 99}';
    const parsed = parseJsonFromClaude<{ safe: number }>(text);
    expect(parsed.safe).toBe(1);
    expect((parsed as Record<string, unknown>).__proto__).not.toMatchObject({ polluted: true });
    expect((parsed as Record<string, unknown>).constructor).not.toBe(99);
  });

  it("rejects oversized JSON", () => {
    const big = "x".repeat(1_000_001);
    expect(() => parseJsonFromClaude(big)).toThrow(/exceeds max JSON size/);
  });
});
