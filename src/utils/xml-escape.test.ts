import { describe, it, expect } from "vitest";
import { escapeXml, escapeXmlDeep } from "./xml-escape";

describe("escapeXml", () => {
  it("escapes <, >, and &", () => {
    expect(escapeXml("</tag>")).toBe("&lt;/tag&gt;");
    expect(escapeXml("a & b")).toBe("a &amp; b");
  });

  it("leaves safe text unchanged", () => {
    expect(escapeXml("hello world")).toBe("hello world");
  });
});

describe("escapeXmlDeep", () => {
  it("recursively escapes strings inside objects and arrays", () => {
    const input = { items: ["</x>", "ok"], nested: { key: "a < b" } };
    const output = escapeXmlDeep(input);
    expect(output.items).toEqual(["&lt;/x&gt;", "ok"]);
    expect(output.nested.key).toBe("a &lt; b");
  });

  it("preserves non-string primitives", () => {
    const input = { n: 42, b: true, nil: null };
    expect(escapeXmlDeep(input)).toEqual({ n: 42, b: true, nil: null });
  });
});
