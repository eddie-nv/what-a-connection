# Implementation Plan: Scraper Orchestrator (Milestone 7)

## Overview
Build `src/agents/research/scraper.ts` as a pure orchestration layer that composes existing primitives (apify runner, link extractor, queue, club detector, Claude) into a two-round, fault-tolerant research pipeline. No new scraping logic — only coordination, delta filtering, and emission.

## New Types to Add

In `src/agents/research/research.types.ts` (extend):
- `ScraperFailure = { stage: string; error: string; url?: string }`
- `ScraperResult = { profiles, groups, groupResearch, hashes, failures }`
- `ScraperInput = { prospectUrl, prospectName, previousHashes?, emit? }`

In `src/agents/research/group-summarizer.types.ts` (new):
- `GroupSummaryResponse = { summary, culture, notableMembers, giftRelevance }`

## Subtasks (implementation order)

### 1. Group summarizer
`src/agents/research/group-summarizer.ts` — `summarizeGroup({group, scrapedText, prospectName}) → Promise<GroupResearch>`. Truncate text to 15k chars, validate keys, caller handles failure.

### 2. Delta filter
`src/agents/research/delta-filter.ts` — `filterNewPosts(profiles, previousHashes) → {filteredProfiles, allHashes}`. Apply BEFORE club detection (simpler, cheaper; idempotent downstream).

### 3. Emit helper
`src/agents/research/scraper-emit.ts` — `createEmitter(emit?)` returns `{stageStart, stageOk, stageFail}`. Single null-check, one-spy testable.

### 4. Round runner
`src/agents/research/scrape-round.ts` — `runScrapeRound(items, emitter) → {profiles, failures}`. Maps items to actor inputs, calls `runActorsParallel`, partitions results. Pure — no queue mutation.

### 5. Queue seeding
In `scraper.ts`: enqueue prospect URL + Google search item at depth 0. Extend `ResearchQueueItem` with optional `query?: string` if `buildActorInput` doesn't already support the google branch.

### 6. Fan-out after each round
Link extraction + enqueue at depth+1. Club detection (`detectGroups`) after round 2 on cumulative filtered profiles. Immutable array accumulation.

### 7. Group sub-scrape
Filter groups with URLs, cap at `MAX_GROUP_SUBSCRAPES = 8`, call `runActorsParallel` on website-content-crawler, then `summarizeGroup`. Emit skipped count.

### 8. Main orchestrator
`runScraper(input) → Promise<ScraperResult>`. Seed queue → 2 rounds loop → delta filter → detectGroups → group sub-scrape → assemble result. Wrap every sub-step in try/catch into `failures`. Never throws.

## Testing
- Unit: delta-filter, group-summarizer (mock Claude), scrape-round (mock apify), scraper-emit.
- Integration: scraper.ts with mocked deps — happy path, depth cap, all-actors-fail, group cap, previousHashes delta.

## Key Decisions
1. Delta BEFORE club detection — cheaper, club detection is idempotent.
2. Emit via wrapper — centralized null-check.
3. Group sub-scrape cap 8 — protects Apify quota.
4. Google search — verify `buildActorInput` supports query; minimal `ResearchQueueItem` extension if not.

## Files
- `src/agents/research/scraper.ts` (new)
- `src/agents/research/group-summarizer.ts` (new)
- `src/agents/research/group-summarizer.types.ts` (new)
- `src/agents/research/delta-filter.ts` (new)
- `src/agents/research/scraper-emit.ts` (new)
- `src/agents/research/scrape-round.ts` (new)
- `src/agents/research/research.types.ts` (extend)
