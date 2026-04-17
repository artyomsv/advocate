# Plan 23 — Analytics Analyst (engagement feedback loop)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Close the loop. Periodically fetch Reddit engagement for recent posts, write history snapshots, and have an Analytics Analyst LLM produce written insights that the Strategist reads on the next draft. Tag `plan23-complete`.

**Prerequisites:** Plans 20-22.

## Architecture

- `RedditClient.fetchThings(legendAccountId, fullnames[])` — GET `/api/info?id=t3_xxx,t3_yyy` → metrics for up to 100 posts at once.
- `MetricsFetcher.sweep()` — for every post in the last 30 days (or since `last_metrics_update > 1h ago`), fetch current metrics, update the `posts` row, append to `post_metrics_history`.
- New table `insights` — LLM-generated text insights per product, timestamped.
- `AnalyticsAnalyst.generate()` — reads last ~30 days of posts + metrics, produces a few bullet-sized insights ("value-posts in r/Parenting 3x the engagement of L2 promos"). Writes one `insights` row per generation.
- `Strategist` prompt gains a section "Recent learnings:" with the last 3 insights for this product.
- Two new BullMQ queues:
  - `analytics.fetch` (cron */1h) — metrics sweep
  - `analytics.analyze` (cron */6h) — new insight

## Tasks

### T1 — fetchThings + MetricsFetcher

`RedditClient.fetchThings(legendAccountId, fullnames)`: GET oauth.reddit.com/api/info?id=... returns the same listing shape we already parse; reuse `parseThread` path.

`MetricsFetcher.sweep()`:
1. Select `posts WHERE platform_post_id IS NOT NULL AND (last_metrics_update IS NULL OR last_metrics_update < now() - interval '1 hour') AND posted_at > now() - interval '30 days'` limit 100.
2. Group by legend_account_id (one OAuth per account).
3. Batch-fetch via fetchThings.
4. For each post: update `posts` row with new upvotes/downvotes/replies/was_removed + `last_metrics_update`. Insert `post_metrics_history` snapshot.

Unit tests: edge cases (empty fullnames, partial response, rate-limit-like response).

### T2 — insights table + AnalyticsAnalyst

New schema: `insights (id uuid, product_id uuid fk, body text, generated_at timestamp, metrics_window jsonb)`.

Migration via `pnpm db:generate`.

`AnalyticsAnalyst` agent:
- Reads last 30 days of posts for a product + their current metrics.
- Prompt: "Summarize what's working and what's not. Give 3-5 actionable learnings."
- Inserts one `insights` row with the LLM response.
- No actual reasoning persisted beyond the text — this is a write-once record.

### T3 — queues + workers + crons

- `analytics.fetch` queue → `createAnalyticsFetchWorker` → MetricsFetcher.sweep (per-product)
- `analytics.analyze` queue → `createAnalyticsAnalyzeWorker` → AnalyticsAnalyst.generate (per-product)
- Launch both in worker.ts when Reddit config exists
- Seed crons via BullMQHeartbeatScheduler on first run (or rely on manual scheduling via the schedules API)

### T4 — Strategist prompt integration + verify + tag

- `Strategist` builds its prompt with a "Recent learnings" block: `SELECT body FROM insights WHERE product_id = $1 ORDER BY generated_at DESC LIMIT 3;`
- If no insights, omit the block.
- Unit test: mock db returns 3 insight rows → prompt includes them.
- Docker verify: worker logs `"worker listening on queue: analytics.fetch"` + `"worker listening on queue: analytics.analyze"` when Reddit configured, nothing otherwise.
- Tag `plan23-complete`.

## Out of scope

- Dashboard analytics page (metrics graphs) — future plan
- Per-legend insights (only per-product for now)
- Reading comments + comment-level engagement
- Detecting moderator removals (basic `was_removed` flag only)

---

**End of Plan 23.**
