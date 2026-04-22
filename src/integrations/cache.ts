import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { CacheLookupResult, CachedDossier } from "./cache.types";
import type { PipelineOutput } from "../orchestrator/pipeline.types";
import { loadEnv } from "../utils/env";
import { now } from "../utils/timing";

const DAY_MS = 24 * 60 * 60 * 1000;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS dossiers (
  prospect_url TEXT PRIMARY KEY,
  output_json TEXT NOT NULL,
  content_hashes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dossiers_updated_at ON dossiers(updated_at);
`;

type DossierRow = {
  prospect_url: string;
  output_json: string;
  content_hashes_json: string;
  created_at: string;
  updated_at: string;
};

export class DossierCache {
  private readonly db: Database.Database;
  private readonly maxAgeMs: number;

  constructor(databasePath: string, maxAgeDays: number) {
    const dir = dirname(databasePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(SCHEMA);
    this.maxAgeMs = maxAgeDays * DAY_MS;
  }

  lookup(prospectUrl: string, forceRefresh = false): CacheLookupResult {
    const row = this.db
      .prepare<[string], DossierRow>(
        "SELECT prospect_url, output_json, content_hashes_json, created_at, updated_at FROM dossiers WHERE prospect_url = ?",
      )
      .get(normalizeUrl(prospectUrl));

    if (!row) return { hit: false, previousHashes: [] };

    const previousHashes = parseJsonArray(row.content_hashes_json);
    if (forceRefresh) return { hit: false, previousHashes };

    const ageMs = Date.now() - new Date(row.updated_at).getTime();
    if (ageMs > this.maxAgeMs) return { hit: false, previousHashes };

    const output = JSON.parse(row.output_json) as PipelineOutput;
    const dossier: CachedDossier = {
      prospectUrl: row.prospect_url,
      output,
      contentHashes: previousHashes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    return { hit: true, dossier, ageMs };
  }

  write(prospectUrl: string, output: PipelineOutput, contentHashes: readonly string[]): void {
    const url = normalizeUrl(prospectUrl);
    const timestamp = now();
    const existing = this.db
      .prepare<[string], { created_at: string }>("SELECT created_at FROM dossiers WHERE prospect_url = ?")
      .get(url);
    const createdAt = existing?.created_at ?? timestamp;
    this.db
      .prepare(
        `INSERT INTO dossiers (prospect_url, output_json, content_hashes_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(prospect_url) DO UPDATE SET
           output_json = excluded.output_json,
           content_hashes_json = excluded.content_hashes_json,
           updated_at = excluded.updated_at`,
      )
      .run(url, JSON.stringify(output), JSON.stringify(contentHashes), createdAt, timestamp);
  }

  close(): void {
    this.db.close();
  }
}

let singleton: DossierCache | null = null;

export function getCache(): DossierCache {
  if (!singleton) {
    const env = loadEnv();
    singleton = new DossierCache(env.databasePath, env.cacheMaxAgeDays);
  }
  return singleton;
}

export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const pathname = u.pathname.replace(/\/+$/, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${pathname}${u.search}`;
  } catch {
    return url.trim().toLowerCase().replace(/\/+$/, "");
  }
}

function parseJsonArray(raw: string): readonly string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}
