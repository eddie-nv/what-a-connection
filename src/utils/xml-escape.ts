export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeXmlDeep<T>(value: T): T {
  if (typeof value === "string") return escapeXml(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => escapeXmlDeep(v)) as unknown as T;
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = escapeXmlDeep(v);
    }
    return out as T;
  }
  return value;
}
