# Agent Roster v2 — plan arc

Closes the gap between the 5 we shipped and the original 7+posting+analytics vision.

## Why an arc instead of one big plan

Each piece unlocks the next. Doing them in one mega-plan gives no checkpoint between "it compiles" and "it actually talks to reddit.com." Five smaller plans, each demoable:

```
Plan 19 — Settings + platform secrets storage      (unblocks everything)
  └── Plan 20 — Reddit OAuth (app + per-legend)   (needs stored secrets)
       └── Plan 21 — Posting adapter              (needs user tokens)
            ├── Plan 22 — Scout agent            (also needs read tokens)
            └── Plan 23 — Analytics Analyst      (needs real posts + engagement)
```

## Plan 19 — Settings page + platform secret store

**Scope:** one encrypted KV table for app-level secrets + a Settings page with category tabs. No external calls yet, just storage.

**Secrets stored:**
- **Reddit OAuth app** — client_id, client_secret, redirect_uri (we shape these up in Plan 20)
- **LLM API keys** — Anthropic, Google, OpenAI, DeepSeek, Qwen (migrate from `.env` so rotations don't require restart)
- **Telegram** — bot token, channel id

**Approach:**
- New table `platform_secrets` (id, category, key, value_encrypted, iv, auth_tag, created_at, updated_at) — reuses the AES-256-GCM master-key pattern from Plan 08.5's `LegendCredentialService`
- `SecretsService` layers it over env: `resolveSecret(key) = db value if set, else process.env[key]` — existing `.env`-based config keeps working
- `GET /secrets/:category` returns masked values (`"••••••••cY"` last 2 chars)
- `PUT /secrets/:category` accepts plaintext, encrypts, stores
- `DELETE /secrets/:category/:key` clears DB entry (falls back to env if any)
- Settings page with Reddit / LLM / Telegram tabs, each a form with masked inputs that accept new values

**Out of scope:** actually USING the secrets. That's Plan 20+.

**Deliverable:** you can enter a Reddit app's client_id/secret via the Settings UI, refresh the page, and the masked value persists. Nothing downstream breaks because nothing yet consumes the new store.

---

## Plan 20 — Reddit OAuth (app + per-legend)

**App-level:** uses client_id/secret from Plan 19's secret store.

**Per-legend OAuth:**
- Legend detail page gains an "Accounts" tab
- "Authorize Reddit account" button → redirects to `https://www.reddit.com/api/v1/authorize?client_id=…&redirect_uri=…&state=<legendId>&scope=read+submit+identity&duration=permanent`
- Callback endpoint `/oauth/reddit/callback` exchanges code → access_token + refresh_token → stores in `legend_credentials` (existing encrypted table)
- Refresh-token handler: `RedditClient.ensureValidToken(legendAccountId)` transparently refreshes when expired

**Deliverable:** a legend can "Connect Reddit" and we store their tokens encrypted. No calls to reddit.com for posting/scanning yet.

---

## Plan 21 — Posting adapter

**What it does:** when a content_plan goes from `approved` to posting, submit it to the right subreddit using the legend's Reddit token.

- `RedditPoster.publish(contentPlan)` → `POST /api/submit` to Reddit
- Records `posts` row with `platform_post_id` + timestamps
- New BullMQ queue `post.publish` — approval webhook (or worker polling) enqueues; poster consumes
- Rate-limit aware (Reddit: 1 post per 10 min per account roughly); retries with backoff

**Deliverable:** approving a content_plan in the Queue page → a real post appears in the target subreddit a few seconds later.

---

## Plan 22 — Scout agent

**What it does:** periodically scan configured subreddits, find threads where a legend could genuinely add value, seed the orchestrator.

- `Scout.scanCommunity(communityId, legendId)` uses the legend's read token
- Fetches `/r/X/new` + `/r/X/top?t=day`
- For each thread: LLM-score relevance to product + legend expertise
- Threads scoring above threshold → enqueue `orchestrate.draft` with `threadContext`
- Cron via existing BullMQHeartbeatScheduler
- Dashboard: new "Scout" card on Agents page + new nav item `Discovery` listing found threads

**Deliverable:** within an hour of deploying Scout, you see genuine Reddit threads surfaced on the Discovery page — each one eligible for a targeted draft.

---

## Plan 23 — Analytics Analyst

**What it does:** measure engagement on posted content, feed learnings back.

- Periodic job: for each `posts` row in the last 30 days, fetch current Reddit engagement (upvotes, comments, awards) → upsert `post_engagement` row
- Analyst reads `post_engagement + content_plans` and writes `insights` rows (LLM-generated summaries: "value-posts in r/Parenting outperform L2 promos 3:1")
- Insights feed into Strategist's prompt context on the next draft
- Dashboard: new "Analytics" page with cards (top-performing content types, best-performing communities, per-legend CTR-ish metrics)

**Dependency:** Plan 11.5 (engine store persistence) makes insights durable. Without it, insights live only in the `insights` table, which is fine for MVP — the Analyst's purpose is to inform strategy, not to be queryable chat history.

**Deliverable:** after a week of real posts, the Strategist's next pick is visibly shaped by what worked before. That's the closed loop.

---

## Timeline

| Plan | Est |
|---|---|
| 19 — Settings + secrets | 1-1.5 days |
| 20 — Reddit OAuth | 1.5-2 days |
| 21 — Posting | 1-1.5 days |
| 22 — Scout | 2 days |
| 23 — Analytics | 2-3 days |

Total: ~2 weeks of focused work. All 5 demoable individually. Plans 19-21 are the critical path to "the system actually posts." Plans 22-23 are the autonomy layer.

---

## Executable plan for 19 will follow

Writing `docs/plans/2026-04-17-19-settings-secrets.md` next, then executing.
