import type { PipelineOutput } from "../orchestrator/pipeline.types";

export type CachedDossier = {
  readonly prospectUrl: string;
  readonly output: PipelineOutput;
  readonly contentHashes: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type CacheHit = {
  readonly hit: true;
  readonly dossier: CachedDossier;
  readonly ageMs: number;
};

export type CacheMiss = {
  readonly hit: false;
  readonly previousHashes: readonly string[];
};

export type CacheLookupResult = CacheHit | CacheMiss;
