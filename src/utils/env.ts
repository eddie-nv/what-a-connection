import { resolve, isAbsolute } from "node:path";
import type { EnvConfig } from "./util.types";

const DEFAULT_DB_PATH = "./data/cache.sqlite";

function str(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.length > 0 ? value : fallback;
}

function num(key: string, fallback: number): number {
  const value = process.env[key];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function logLevel(): EnvConfig["logLevel"] {
  const v = process.env.LOG_LEVEL;
  if (v === "debug" || v === "info" || v === "warn" || v === "error") return v;
  return "info";
}

function safeDatabasePath(raw: string): string {
  if (raw.includes("\0")) throw new Error("DATABASE_PATH contains null byte");
  const cwd = process.cwd();
  const absolute = isAbsolute(raw) ? resolve(raw) : resolve(cwd, raw);
  if (!absolute.startsWith(cwd)) {
    throw new Error(`DATABASE_PATH must be within project directory (got: ${absolute})`);
  }
  return absolute;
}

export function loadEnv(): EnvConfig {
  return {
    apifyApiKey: str("APIFY_API_KEY", ""),
    anthropicApiKey: str("ANTHROPIC_API_KEY", ""),
    port: num("PORT", 3000),
    databasePath: safeDatabasePath(str("DATABASE_PATH", DEFAULT_DB_PATH)),
    cacheMaxAgeDays: num("CACHE_MAX_AGE_DAYS", 7),
    logLevel: logLevel(),
  };
}

export function requireSecret(key: "APIFY_API_KEY" | "ANTHROPIC_API_KEY"): string {
  const v = process.env[key];
  if (!v || v.length === 0) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return v;
}
