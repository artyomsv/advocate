# Plan 21 — Reddit posting adapter

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** When a content_plan lands at `status=approved`, submit it to Reddit via the legend's stored OAuth tokens. Record the resulting post (with `platform_post_id`, url, score snapshot) in the existing `posts` table. Tag `plan21-complete`.

**Prerequisites:** Plan 20 complete (OAuth tokens in `legend_credentials`).

## Architecture

- **RedditClient** — thin wrapper around `fetch` for the Reddit API. Handles:
  - `ensureValidToken(legendAccountId)`: reads tokens from store, refreshes if `expiresAt < now + 60s`, returns a fresh bearer.
  - `submit({ sr, title, text|url })`: POST to `/api/submit`.
- **Poster worker** — BullMQ queue `post.publish`. Consumer:
  1. Loads content_plan by id
  2. Loads legend_account + RedditClient for that legend
  3. Submits
  4. Inserts `posts` row with `platform_post_id`
  5. Transitions content_plan `approved → posted`
- **Trigger** — when ContentPlanService.approve succeeds, enqueue `post.publish` with `delayMs = max(0, scheduledAt - now)`. The Plan 14 approve endpoint becomes the enqueue site.

No dashboard changes — posts table already exists, a real Posts page can come later.

---

## Task 1 — RedditClient

**Files:**
- `packages/app/src/reddit/client.ts` (new)
- `packages/app/tests/reddit/client.test.ts`

```typescript
// client.ts
import { getEnv } from '../config/env.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { childLogger } from '../config/logger.js';
import { type RedditAppConfig, refreshAccessToken } from './oauth.js';
import { RedditTokenStore } from './tokens.js';

const log = childLogger('reddit.client');

export interface SubmitRequest {
  subreddit: string;
  title: string;
  body: string; // text post; url posts are out of scope
}

export interface SubmitResult {
  id: string; // e.g. t3_abc123 — "name" returned by Reddit
  url: string; // full URL to the post
  postedAt: string;
}

export class RedditClient {
  constructor(
    private readonly cfg: RedditAppConfig,
    private readonly tokens: RedditTokenStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ensureValidToken(legendAccountId: string): Promise<string> {
    const stored = await this.tokens.load(legendAccountId);
    if (!stored) throw new Error(`No Reddit tokens for legend_account ${legendAccountId}`);
    const now = Date.now();
    const exp = new Date(stored.expiresAt).getTime();
    if (exp - now > 60_000) return stored.accessToken;

    log.info({ legendAccountId }, 'refreshing reddit token');
    const refreshed = await refreshAccessToken(this.cfg, stored.refreshToken, this.fetchImpl);
    const expiresAt = new Date(now + refreshed.expires_in * 1000).toISOString();
    await this.tokens.save(legendAccountId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
      scope: refreshed.scope,
      expiresAt,
    });
    return refreshed.access_token;
  }

  async submit(legendAccountId: string, request: SubmitRequest): Promise<SubmitResult> {
    const bearer = await this.ensureValidToken(legendAccountId);
    const params = new URLSearchParams({
      api_type: 'json',
      kind: 'self',
      sr: request.subreddit,
      title: request.title,
      text: request.body,
    });
    const res = await this.fetchImpl('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.cfg.userAgent,
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Reddit submit failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      json?: {
        errors?: unknown[];
        data?: { id?: string; name?: string; url?: string };
      };
    };
    const data = json.json?.data;
    if (!data?.name || !data.url) {
      throw new Error(`Reddit submit unexpected response: ${JSON.stringify(json)}`);
    }
    return { id: data.name, url: data.url, postedAt: new Date().toISOString() };
  }
}

export function buildRedditClient(
  cfg: RedditAppConfig,
  db: NodePgDatabase<typeof schema>,
  fetchImpl: typeof fetch = fetch,
): RedditClient {
  return new RedditClient(cfg, new RedditTokenStore(db, getEnv().CREDENTIAL_MASTER_KEY), fetchImpl);
}
```

Unit tests for `ensureValidToken` (no refresh vs refresh path) and `submit` (happy path + error path), all with mocked fetch. ~5 tests.

---

## Task 2 — Poster worker + enqueue-on-approve

**Files:**
- `packages/app/src/worker/post-publish-worker.ts` (new)
- `packages/app/src/worker/queues.ts` (add queue name)
- `packages/app/src/worker/worker.ts` (launch)
- `packages/app/src/content-plans/content-plan.service.ts` (enqueue on approve)

### queues.ts

```typescript
export const QUEUE_NAMES = {
  orchestrate: 'orchestrate',
  postPublish: 'post.publish',  // NEW
} as const;

export interface PostPublishJobData {
  contentPlanId: string;
}
```

### post-publish-worker.ts

Consumes `post.publish`. Loads contentPlan + legendAccount + community, instantiates RedditClient, calls submit, inserts `posts` row, transitions content_plan `approved → posted`.

Need to look up the subreddit name from the community row. If `community.platform !== 'reddit'`, skip/fail with error.

### Enqueue on approve

Modify `ContentPlanService.approve` (or the route) to enqueue a BullMQ job when a content_plan transitions to approved. Use `delay: Math.max(0, scheduledAt - Date.now())` so scheduled-future posts wait until their time.

### worker.ts

Add `createPostPublishWorker` alongside `createOrchestrateWorker`. Only launch if the Reddit app creds exist (via SecretsService).

---

## Task 3 — Verify + tag

- Typecheck, unit tests
- Docker boot verifies worker logs: `"post-publish worker listening"` when creds exist, `"Reddit not configured, post-publish worker not started"` otherwise.
- Tag `plan21-complete`.

Live flow (owner manual, as always): connect a legend via Plan 20, approve a content_plan, watch for posts row + new Reddit post.

## Out of scope

- Image / link posts (text-only for now)
- Flair selection
- Handling SUBREDDIT_NOEXIST, SUBREDDIT_NOTALLOWED, RATELIMIT errors with structured recovery (just log + surface the API error for this plan)
- Scheduled retries on transient failure
- Reading post engagement (Plan 23)

---

**End of Plan 21.**
