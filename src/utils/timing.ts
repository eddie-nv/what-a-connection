import type { TimedResult } from "./util.types";

export async function timed<T>(fn: () => Promise<T>): Promise<TimedResult<T>> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round(performance.now() - start);
  return { result, durationMs };
}

export function now(): string {
  return new Date().toISOString();
}
