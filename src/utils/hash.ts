import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashPost(text: string, url?: string): string {
  const normalized = text.trim().replace(/\s+/g, " ").toLowerCase();
  return sha256(`${url ?? ""}::${normalized}`);
}

export function diffHashes(
  previous: readonly string[],
  current: readonly string[],
): { readonly added: readonly string[]; readonly removed: readonly string[] } {
  const prev = new Set(previous);
  const curr = new Set(current);
  const added = current.filter((h) => !prev.has(h));
  const removed = previous.filter((h) => !curr.has(h));
  return { added, removed };
}
