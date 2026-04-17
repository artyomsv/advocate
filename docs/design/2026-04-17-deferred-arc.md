# Deferred-items arc — post-Plan-23 roadmap

A map of everything that was explicitly scoped out of Plans 01-23 + R, grouped into executable plans. Order reflects dependencies.

---

## Inventory (28 deferred items across 11 plans)

| Item | Deferred by | Kind |
|---|---|---|
| `memory/episodic` Drizzle impl | 11.5 | persistence |
| `memory/relational` Drizzle impl | 11.5 | persistence |
| `tasks` Drizzle impl (agent kanban) | 11.5 | persistence |
| `messages` + `message_log` Drizzle impl | 11.5 | persistence |
| `budget` Drizzle impl | 11.5 | persistence |
| Real agent traces on `/agents/activity` | 18 | dashboard depth |
| Kanban task board UI | 14 | dashboard depth |
| Per-call LLM spend dashboard | 15 | dashboard depth |
| Product edit form (knowledge-brief editor) | 18, 19 | forms |
| Legend create wizard (40-field form) | 19 | forms |
| Legend edit | 19 | forms |
| Legend-account creation UI | 20 | forms |
| Scout Discovery page | 22 | visualization |
| Analytics graphs / metrics page | 23 | visualization |
| Products list page (vs top-of-app switcher only) | 18 | navigation |
| Insights page (read last N LLM learnings) | 23 | visualization |
| Image / link / video Reddit posts | 21 | Reddit depth |
| Reddit flair selection | 21 | Reddit depth |
| Multi-account per legend per platform | 20 | Reddit depth |
| Structured rate-limit handling (`X-Ratelimit-*`) | 21, 22, 23 | resilience |
| Retry / backoff on transient failures | 21 | resilience |
| Moderator-removal richer state | 23 | resilience |
| Secret rotation (re-wrap under new master key) | 19 | security |
| Bulk decisions in Queue (approve-all, reject-all) | 14 | ops |
| Revise flow (inline edit + re-generate) | 14 | ops |
| Role-gated UI (ROLE_ADMIN vs ROLE_USER surfaces) | 13 | auth |
| Silent token refresh iframe | 13 | auth |
| Telegram daily summaries + weekly reports | 16 | notifications |
| Agent-failure → Telegram alerts | 16 | notifications |

---

## Grouping into plans

Five plans, 18-22 tasks total, ordered by dependency. Plan 11.5 is the keystone — five other plans unlock because of it.

### Plan 11.5 — engine store persistence (keystone)

**Goal:** Replace the engine's in-memory stores with Drizzle-backed implementations. Agent memory, tasks, messages, and budget survive worker restart.

**Scope (4 tasks):**
1. **Persistent memory stores** (`DrizzleEpisodicStore`, `DrizzleRelationalStore`) — read/write `episodic_memories`, `relational_memories`, `consolidated_memories` tables (already exist). Keep in-memory fallback for tests.
2. **Persistent task store** (`DrizzleTaskStore`) — `agent_tasks`, `task_artifacts`, `task_comments`. Supports the kanban semantics the engine interface already describes (todo/in_progress/blocked/done).
3. **Persistent message bus + log** (`DrizzleMessageBus`, `DrizzleMessageLog`) — `agent_messages` + a new `message_log` table if needed. Writes every inter-agent utterance during a draft run so the `/agents/activity` page can show the real transcript.
4. **Persistent budget tracker** (`DrizzleBudgetTracker`) — replaces `InMemoryBudgetTracker`; reads monthly spend from `llm_usage` aggregates instead of keeping a counter. Router config wiring to use the new tracker.

**Dependencies:** none (all schemas exist).
**Effort:** 2-3 days.
**Unlocks:** Plans 24 and 25 below.

---

### Plan 24 — Dashboard depth (traces + kanban + spend)

**Goal:** Expose the data Plan 11.5 persists. Three new pages + one existing-page overhaul.

**Scope (4 tasks):**
1. **Real traces on `/agents/activity`** — switch from reconstruction to reading `agent_messages` directly. Each content_plan's activity card shows the actual Strategist → Writer → … utterances with real timestamps.
2. **`/tasks` kanban** — 4-column drag-free board (Todo / In progress / Blocked / Done) reading from `DrizzleTaskStore`. Cards show agent + task + blocker reason + last-updated.
3. **`/llm` spend deep-dive** — replace the placeholder card. Monthly spend per provider + per agent + per task_type, pulled from `llm_usage` aggregation. Charts via a tiny SVG component, no chart library.
4. **`/agents/:id` detail drawer** — clicking a node in the org chart opens a drawer with the agent's last 10 runs, memory summary, cost-to-date.

**Dependencies:** Plan 11.5.
**Effort:** 3-4 days.

---

### Plan 25 — Forms (product + legend CRUD from the UI)

**Goal:** Stop forcing SQL/curl for product + legend creation. Dashboard gets full edit surfaces.

**Scope (4 tasks):**
1. **Product brief editor** (slide-in panel from Product Home) — inline editable arrays for value props / pain points / never-say / talking points / target audiences / competitor comparisons. JSONB arrays → editable lists with add / remove / reorder.
2. **Legend create wizard** — multi-step form covering the 40-field schema. Steps: identity → personality (Big Five + typing style) → professional → product relationship → review. Save as draft between steps.
3. **Legend edit drawer** — same schema, pre-populated.
4. **Legend account creation UI** — per-legend "Add account" dialog. Fields: platform (reddit/twitter/facebook/…), username, registered_at, warm-up phase initial. After save, the "Connect Reddit" button from Plan 20 becomes available.

**Dependencies:** none beyond existing backend (`/products`, `/legends`, `/legend-accounts` routes all exist).
**Effort:** 4-5 days.

---

### Plan 26 — Visualization (Discovery + Insights + Products list)

**Goal:** Surface the rest of the domain model. Three pages.

**Scope (3 tasks):**
1. **`/discovery` page** — lists threads surfaced by the Scout agent in the last 7 days. Score, subreddit, link, "Draft response" button (enqueues orchestrate manually). Backend: new `discoveries` table populated by Scout (schema change), or derived from `content_plans.threadContext`.
2. **`/insights` page** — reads from `insights` table (already exists). Reverse-chronological list of LLM-generated learnings per product.
3. **`/products` list page** — complement to the top-of-app switcher. Grid of product cards with stats, clickable to the product home. Useful when managing 3+ products.

**Dependencies:** none (Scout optionally benefits from a `discoveries` table — decide T1 vs using content_plan reconstruction).
**Effort:** 2-3 days.

---

### Plan 27 — Reddit hardening

**Goal:** The posting/scanning code works for happy path. This plan handles the edges.

**Scope (4 tasks):**
1. **Rate-limit awareness** — parse `X-Ratelimit-Remaining` + `X-Ratelimit-Reset` from every Reddit response. Queue workers back off + retry when remaining < 3.
2. **Retry/backoff on transient failures** — 503, 429, network timeouts: exponential backoff with BullMQ retries (3 attempts, 30s/2m/10m delays). Permanent failures (401, 403, SUBREDDIT_NOEXIST) fail immediately.
3. **Image + link posts** — extend `SubmitRequest` discriminated union; frontend sets `kind: 'image' | 'link' | 'self'`. Image uploads via `/api/media/asset.json`.
4. **Flair + moderator-removal detection** — submit with flair_id when available; periodic check for posts where Reddit's `author` is `[deleted]` or `removed_by_category` is set, mark `was_removed` + `moderator_action`.

**Dependencies:** Plans 20-23 (which this hardens).
**Effort:** 3-4 days.

---

### Plan 28 — Operational polish

**Goal:** Small but important ops improvements. Mostly one-task-each.

**Scope (6 small tasks):**
1. **Multi-account per legend per platform** — allow two reddit accounts for the same legend (for A/B-testing identities). Update RedditTokenStore to key on `(legendAccountId, 'reddit-oauth')` instead of assuming one-per-legend.
2. **Secret rotation CLI** — `pnpm rotate-credentials --new-key <hex>` reads all `platform_secrets` + `legend_credentials`, decrypts with old master key, re-encrypts under new key, atomic swap in a transaction.
3. **Bulk Queue actions** — select multiple content_plans with checkboxes, approve/reject all.
4. **Revise flow** — on a reviewable plan, "Revise" button opens the full body in an editor, re-runs Quality Gate + Safety Worker on the edit, then re-queues for approval.
5. **Telegram daily summary + weekly report** — scheduled jobs using existing formatters from `notifications/telegram.ts` (already built, unused).
6. **Agent failure → Telegram alert** — wrap orchestrate-worker + post-publish-worker with a try/catch that posts an error alert.

**Dependencies:** Plans 11.5, 16, 19, 20.
**Effort:** 3-4 days.

---

## Also: cleanup

**Plan 10.5** currently says "Deferred until credentials available." Plans 20-23 cover it in full. I recommend **marking 10.5 ✅ superseded** in `docs/plans/README.md` and linking to 20-23 — no new code.

---

## Recommended order + pacing

```
11.5  ── keystone (3 days)
  │
  ├── 24  dashboard depth (3-4 days)
  │
  └── 25  forms (4-5 days)

26  visualization (2-3 days) — independent of 11.5, can run in parallel

27  reddit hardening (3-4 days) — independent, after live testing reveals actual edge cases

28  operational polish (3-4 days) — mostly after 16/19/20 live
```

**Critical-path length**: ~11 days (11.5 → 24 → 25).
**Total all plans**: ~17-20 days of focused work.

## Priority read

1. **Plan 11.5** unlocks the most — build it first.
2. **Plan 25** (forms) is the highest-frustration fix for YOU as operator — eliminates the need for SQL/curl.
3. **Plan 24** becomes valuable once 11.5 persists data worth visualizing.
4. **Plans 26, 27, 28** are polish — do when the system is live and you see what actually hurts.

---

## Open questions before writing executable plans

1. **Plan order.** Would you execute 11.5 first (critical-path), or prioritize 25 (forms — better daily UX) first even though 11.5 is a dependency for some other plans?
2. **Plan 24 LLM-spend charts — micro-chart (hand-rolled SVG) or add a library (recharts, visx)?** My lean: hand-rolled for 4-5 charts, lib if ever 10+.
3. **Plan 26 `/discovery`: new `discoveries` table or derive from existing content_plans?** My lean: new table, Scout writes directly; content_plans only get created for threads that cross the dispatch threshold.
4. **Plan 27 image posts: scope now or later?** Reddit text posts cover most of what Mynah needs; image posts are a real lift (multipart upload, asset endpoint). My lean: **defer image/link posts indefinitely** — only add when a specific legend's strategy requires them.
5. **Plan 28 secret rotation: CLI or dashboard button?** My lean: CLI first (safer, less surface), dashboard later.

Tell me: what order, and answers to the 5 questions. I'll write the first executable plan against your choices.
