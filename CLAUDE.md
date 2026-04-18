# What A Connection

## Project Summary
Agent system for cold outreach. Researches a prospect via social media, analyzes posts + images, identifies interests/passions/communities, recommends 3 conversation-sparking gifts, drafts an outreach note.

## Tech Stack
- TypeScript + Express (backend)
- Apify (parallel social media scraping — 6 Actors)
- Anthropic Claude (text analysis + Vision for image analysis)
- SQLite via better-sqlite3 (caching)
- SSE (real-time pipeline progress streaming)

## Architecture
Sequential pipeline with parallel fan-out:
1. Cache check (SQLite)
2. Parallel Apify scrape (6 Actors) + club/event detection → sub-scrapes
3. Cross-link discovery → queue and scrape new platforms
4. Image analysis (Claude Vision) — parallel with step 5
5. Text analysis (Claude) — parallel with step 4
6. Profile synthesis (merge all data, apply personal info filter)
7. Gift recommendation (3 gifts ranked by conversation potential, with citations)
8. Outreach draft (tone-matched, CTA-driven)
9. Cache write

## Sponsor Context
Built for a marketing agents hackathon. Sponsors: Apify, Minds AI, Lovable.
Apify is a prize category — must be a load-bearing, visible integration.

## ECC Components Active
Skills: autonomous-loops, backend-patterns, market-research, investor-outreach, iterative-retrieval, content-engine, coding-standards (TS), continuous-learning-v2, security-review, tdd-workflow, verification-loop
Agents: architect, planner, code-reviewer, security-reviewer, tdd-guide, loop-operator, docs-lookup, build-error-resolver
Hooks: memory-persistence, strategic-compact
Commands: /multi-plan, /multi-execute, /multi-backend, /build-fix, /checkpoint, /code-review, /learn, /instinct-status
