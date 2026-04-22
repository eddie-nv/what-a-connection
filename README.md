# What A Connection

Agent system for cold outreach. Point it at a prospect's social profile URL and it researches them across platforms, identifies their interests, recommends three conversation-sparking gifts, and drafts a personalized outreach note.

Built for a marketing agents hackathon. Load-bearing sponsor integration: **Apify**. Reasoning/vision: **Anthropic Claude**.

## What It Does

Given a prospect URL + a short brief about the sender (who you are, why you're reaching out, what you want to discuss), the pipeline returns:

- A synthesized profile of the prospect (interests, recent hooks, communities, images)
- Three ranked gift recommendations with citations back to the evidence
- A tone-matched outreach note built around the top gift

Results stream over SSE so the UI can show stage-by-stage progress in real time.

## Pipeline

Sequential stages with parallel fan-out where independent:

1. **Cache check** — SQLite lookup keyed by prospect URL. Hit → return immediately.
2. **Scrape** — parallel Apify actors across 6 platforms, plus club/event detection that fans out sub-scrapes.
3. **Cross-link discovery** — extract links found on one platform, queue the new platforms, scrape them too.
4. **Image analysis** — Claude Vision on scraped media *(parallel with step 5)*.
5. **Text analysis** — Claude over posts/bio/captions *(parallel with step 4)*.
6. **Synthesis** — merge text + image + group research into a single profile. Runs through a personal-info redaction guardrail first.
7. **Gift recommendation** — three gifts ranked by conversation potential, each citing the evidence it was drawn from.
8. **Outreach draft** — tone-matched note built around the top gift and the sender's stated reason for connecting.
9. **Cache write** — persist the dossier with content hashes so the next run can delta-filter.

A creepiness guardrail runs over the final output; recoverable stage failures surface in the response without killing the pipeline.

## Tech Stack

- **Backend**: TypeScript + Express 5
- **Scraping**: Apify (6 actors, parallel fan-out)
- **LLM**: Anthropic Claude (text + Vision)
- **Cache**: SQLite via `better-sqlite3`
- **Validation**: Zod at every system boundary
- **Streaming**: Server-Sent Events for pipeline progress
- **Tests**: Vitest
- **Frontend**: static HTML/CSS/JS in `public/`

## Getting Started

```bash
npm install
cp .env.example .env
# fill in APIFY_API_KEY and ANTHROPIC_API_KEY
npm run dev
```

Then open http://localhost:3000.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with watch (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Run Vitest suite |
| `npm run test:watch` | Vitest in watch mode |

### Environment

See `.env.example`:

- `APIFY_API_KEY` — required for scraping
- `ANTHROPIC_API_KEY` — required for analysis, synthesis, gifts, and draft
- `PORT` — default `3000`
- `DATABASE_PATH` — default `./data/cache.sqlite` (must stay within project dir)
- `CACHE_MAX_AGE_DAYS` — default `7`
- `LOG_LEVEL` — `debug` | `info` | `warn` | `error`

## API

### `POST /api/research`

Runs the full pipeline and streams progress over SSE.

```json
{
  "prospectUrl": "https://...",
  "prospectName": "optional",
  "sender": {
    "name": "your name",
    "role": "optional",
    "company": "optional",
    "reasonForConnecting": "why you're reaching out",
    "discussionTopic": "what you want to discuss"
  },
  "forceRefresh": false
}
```

Response: `text/event-stream`. Each stage emits `started` / `completed` / `failed` events. Terminal event `complete` carries the full dossier.

### `GET /api/health`

Returns `{ status: "ok", timestamp }`.

## Project Layout

```
src/
  agents/
    analysis/     — image + text analyzers (Claude)
    research/     — scraper, queue, club detector, delta filter, link extractor
    synthesis/    — profile synthesizer
    gifting/      — gift recommender
    outreach/     — outreach drafter
  guardrails/     — creepiness check, personal-info filter
  integrations/   — Apify client, Claude client, SQLite cache
  orchestrator/   — pipeline + SSE events
  routes/         — Express routers (gift, health)
  utils/          — concurrency, retry, hash, timing, env, xml-escape
public/           — static web UI
scripts/          — e2e.sh, smoke.sh
data/             — SQLite cache (gitignored)
```

## Design Notes

- **Immutable data flow**: every stage produces new objects; nothing mutates upstream results.
- **Delta filtering**: content hashes let re-runs skip re-analyzing unchanged posts.
- **Guardrails run before persistence**: the personal-info filter redacts before synthesis, so the cache never holds raw PII surfaces the filter would strip.
- **Fail-soft stages**: recoverable failures (cache miss, one scraper down, outreach draft) are captured as `StageFailure` entries; the pipeline returns whatever it could produce.
- **Boundaries validated with Zod**: request bodies and env parsing fail fast with clear messages.
