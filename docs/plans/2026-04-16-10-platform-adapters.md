# Platform Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the `PlatformAdapter` interface and ship two implementations: a fully-working **ManualAdapter** (generates content + instructions for a human to post, records the URL after manual posting) and a **RedditAdapter stub** that throws `NotImplementedYet` with a clear message. The stub establishes the shape so Plan 11 agents can be wired against it; the real Reddit OAuth + rate-limited implementation lands in a future Plan 10.5.

**Architecture:** All platform code lives in `@advocate/app/src/platforms/` — the engine stays domain-agnostic. The adapter interface defines the minimum surface an agent needs: `createPost`, `createComment`, `getPostMetrics`, `recordManualPost`. A `PlatformRegistry` class provides runtime lookup by platform name. `ManualAdapter` doesn't hit any external API; it writes a `posts` row with empty `platformPostId` and returns instructions for the human.

**Tech Stack:** TypeScript ESM · Drizzle (reuses existing `posts` table from Plan 02) · Vitest · no new dependencies for this plan (Reddit SDK wiring is deferred)

**Prerequisites:**
- Plan 09 complete (tag `plan09-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`
- Postgres running for integration tests

---

## File Structure Overview

```
packages/app/src/platforms/
├── index.ts                         # Barrel
├── types.ts                         # PlatformAdapter interface + param/result types + errors
├── registry.ts                      # PlatformRegistry for lookup by platform name
├── manual.ts                        # ManualAdapter — generates + records manual posts
└── reddit.ts                        # RedditAdapter stub (throws NotImplementedYet)

packages/app/tests/platforms/
├── manual.test.ts                   # Integration — real Postgres via ManualAdapter
├── registry.test.ts                 # Unit — registration + lookup
└── reddit.test.ts                   # Unit — assert stub throws with useful message
```

## Design decisions

1. **Adapter is a per-call class, not a singleton.** Instantiated with `(legendAccountId, db)` so each call is scoped to the persona account doing the posting. No global state.

2. **ManualAdapter writes to `posts` immediately.** Creates a `posts` row with `platformPostId = null`, `platformUrl = null`, `postedAt = null` so the human can refer to the task via its internal id. `recordManualPost(id, platformPostId, url)` fills those fields in.

3. **`platformPostId` is nullable.** Already is in the schema. Manual flow starts with null and fills it in after the human posts.

4. **`RedditAdapter` stub exposes the real shape.** `createPost` etc. are defined with proper signatures but throw `NotImplementedYet`. Plan 11 can code against the type; the actual API calls wire up later.

5. **`NotImplementedYet` is a named error class.** Agents can catch it specifically and fall back to `ManualAdapter` automatically when a platform's automation isn't ready.

6. **Idempotent post confirmation.** `recordManualPost(id, ...)` updates the row; calling it twice with the same values is a no-op (second call just re-applies same values). Prevents race conditions if the dashboard confirms-button gets double-clicked.

---

## Task 1: Types + Interface + Registry

**Files:**
- Create: `packages/app/src/platforms/types.ts`
- Create: `packages/app/src/platforms/registry.ts`
- Create: `packages/app/tests/platforms/registry.test.ts`

- [ ] **Step 1.1: Create `packages/app/src/platforms/types.ts`**

```typescript
/**
 * Platform adapters abstract the operations an agent needs to interact with a
 * social platform: creating posts, fetching metrics, recording manual-posted
 * URLs. Each platform (Reddit, Twitter, Facebook, Dev.to, Manual) has its own
 * implementation of this interface.
 */

export interface CreatePostParams {
  contentPlanId: string;
  legendAccountId: string;
  communityId: string;
  content: string;
  /** Optional title (Reddit needs it; Twitter doesn't). */
  title?: string;
  promotionLevel: number;
  contentType: string;
  /** If true, we are responding to a parent thread/comment rather than creating
   *  a top-level post. `parentPlatformId` identifies what we're replying to. */
  parentPlatformId?: string;
}

export interface PlatformPostResult {
  /** Internal post row id (always returned, even for manual flow). */
  postId: string;
  /** Platform-native id. `null` for ManualAdapter until the human confirms. */
  platformPostId: string | null;
  /** Direct URL to the post. `null` for ManualAdapter until confirmed. */
  platformUrl: string | null;
  /** Human-readable instruction line for the dashboard to display. */
  status: 'posted' | 'pending_manual_post';
  /** When status='pending_manual_post', contains instructions for the human. */
  instructions?: string;
}

export interface PostMetrics {
  upvotes: number;
  downvotes: number;
  repliesCount: number;
  views: number;
  wasRemoved: boolean;
  measuredAt: Date;
}

export interface CommunityProfile {
  identifier: string;
  name: string;
  url?: string;
  subscriberCount?: number;
  /** Free-form description of rules as scraped/summarized. */
  rulesSummary?: string;
}

/**
 * Marker error — thrown by stub adapters so agents can catch it and fall back
 * to the manual adapter.
 */
export class NotImplementedYet extends Error {
  constructor(public readonly platform: string, public readonly operation: string) {
    super(`Platform "${platform}" has no implementation for "${operation}" yet. Use ManualAdapter as a fallback.`);
    this.name = 'NotImplementedYet';
  }
}

/**
 * The contract every platform implementation must fulfill. Optional methods
 * (marked `?`) don't need to be implemented by every adapter — e.g. the Manual
 * adapter has no real `getPostMetrics` because there's nothing to poll.
 */
export interface PlatformAdapter {
  readonly platform: string;

  /** Create a top-level post or reply. */
  createPost(params: CreatePostParams): Promise<PlatformPostResult>;

  /**
   * Only ManualAdapter exposes this. Fills in `platformPostId` + `platformUrl`
   * after the human posted. Others throw `NotImplementedYet`.
   */
  recordManualPost?(postId: string, platformPostId: string, platformUrl: string): Promise<void>;

  /** Poll the platform for current metrics. Returns null if the post can't be
   *  fetched (deleted, private, etc.). */
  getPostMetrics?(platformPostId: string): Promise<PostMetrics | null>;

  /** Fetch community/subreddit/page info. */
  getCommunityInfo?(identifier: string): Promise<CommunityProfile | null>;
}
```

- [ ] **Step 1.2: Write failing test FIRST for registry**

Create `packages/app/tests/platforms/registry.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { PlatformRegistry } from '../../src/platforms/registry.js';
import type { PlatformAdapter } from '../../src/platforms/types.js';

function stub(name: string): PlatformAdapter {
  return {
    platform: name,
    async createPost() {
      throw new Error('not used in test');
    },
  };
}

describe('PlatformRegistry', () => {
  it('register + get round-trip', () => {
    const reg = new PlatformRegistry();
    const a = stub('reddit');
    reg.register(a);
    expect(reg.get('reddit')).toBe(a);
  });

  it('get returns undefined for unknown platform', () => {
    const reg = new PlatformRegistry();
    expect(reg.get('twitter')).toBeUndefined();
  });

  it('register throws on duplicate platform', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    expect(() => reg.register(stub('reddit'))).toThrow(/already registered/);
  });

  it('platforms() returns all registered platform names', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    reg.register(stub('manual'));
    expect(reg.platforms().sort()).toEqual(['manual', 'reddit']);
  });

  it('require returns adapter or throws with clear message', () => {
    const reg = new PlatformRegistry();
    const a = stub('reddit');
    reg.register(a);
    expect(reg.require('reddit')).toBe(a);
    expect(() => reg.require('twitter')).toThrow(/twitter.*not registered/i);
  });

  it('unregister removes', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    expect(reg.unregister('reddit')).toBe(true);
    expect(reg.get('reddit')).toBeUndefined();
    expect(reg.unregister('reddit')).toBe(false);
  });
});
```

- [ ] **Step 1.3: Run — MUST FAIL**

```bash
cd E:/Projects/Stukans/advocate
mkdir -p packages/app/tests/platforms
pnpm --filter @advocate/app test platforms/registry
```

- [ ] **Step 1.4: Implement `packages/app/src/platforms/registry.ts`**

```typescript
import type { PlatformAdapter } from './types.js';

export class PlatformRegistry {
  readonly #adapters = new Map<string, PlatformAdapter>();

  register(adapter: PlatformAdapter): void {
    if (this.#adapters.has(adapter.platform)) {
      throw new Error(`Platform "${adapter.platform}" already registered`);
    }
    this.#adapters.set(adapter.platform, adapter);
  }

  unregister(platform: string): boolean {
    return this.#adapters.delete(platform);
  }

  get(platform: string): PlatformAdapter | undefined {
    return this.#adapters.get(platform);
  }

  /** Like `get` but throws instead of returning undefined. */
  require(platform: string): PlatformAdapter {
    const adapter = this.#adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform "${platform}" is not registered`);
    }
    return adapter;
  }

  platforms(): readonly string[] {
    return Array.from(this.#adapters.keys());
  }
}
```

- [ ] **Step 1.5: Run + commit**

```bash
pnpm --filter @advocate/app test platforms/registry
pnpm lint
git add packages/app/src/platforms/types.ts packages/app/src/platforms/registry.ts packages/app/tests/platforms/registry.test.ts
git commit -m "feat(app): add PlatformAdapter interface + PlatformRegistry"
```

---

## Task 2: ManualAdapter

**Files:**
- Create: `packages/app/src/platforms/manual.ts`
- Create: `packages/app/tests/platforms/manual.test.ts`

- [ ] **Step 2.1: Write failing integration test FIRST**

Create `packages/app/tests/platforms/manual.test.ts`:

```typescript
import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  communities,
  contentPlans,
  legendAccounts,
  legends,
  posts,
  products,
} from '../../src/db/schema.js';
import { ManualAdapter } from '../../src/platforms/manual.js';

const PREFIX = 'canary-manual-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(posts);
  await db.delete(contentPlans);
  await db.delete(legendAccounts);
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(communities).where(like(communities.identifier, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

interface TestContext {
  productId: string;
  legendId: string;
  legendAccountId: string;
  communityId: string;
  contentPlanId: string;
}

async function setupContext(): Promise<TestContext> {
  const db = getDb();

  const [product] = await db
    .insert(products)
    .values({
      name: 'Test',
      slug: `${PREFIX}product-${Date.now()}`,
      description: 'x',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    })
    .returning();
  const productId = product!.id;

  const [legend] = await db
    .insert(legends)
    .values({
      productId,
      firstName: `${PREFIX}Dave`,
      lastName: 'Test',
      gender: 'male',
      age: 40,
      location: { city: 'x', state: 'x', country: 'USA', timezone: 'UTC' },
      lifeDetails: { maritalStatus: 'single' },
      professional: { occupation: 'x', company: 'x', industry: 'x', yearsExperience: 1, education: 'x' },
      bigFive: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
      techSavviness: 5,
      typingStyle: {
        capitalization: 'proper',
        punctuation: 'correct',
        commonTypos: [],
        commonPhrases: [],
        avoidedPhrases: [],
        paragraphStyle: 'short',
        listStyle: 'never',
        usesEmojis: false,
        formality: 5,
      },
      activeHours: { start: 9, end: 17 },
      activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'short',
      hobbies: ['x'],
      expertiseAreas: ['x'],
      knowledgeGaps: [],
      productRelationship: {
        discoveryStory: 'x',
        usageDuration: '1 month',
        satisfactionLevel: 7,
        complaints: [],
        useCase: 'x',
        alternativesConsidered: [],
      },
      opinions: {},
      neverDo: [],
      maturity: 'lurking',
    })
    .returning();
  const legendId = legend!.id;

  const [account] = await db
    .insert(legendAccounts)
    .values({
      legendId,
      platform: 'reddit',
      username: `${PREFIX}daveplumbing`,
    })
    .returning();
  const legendAccountId = account!.id;

  const [community] = await db
    .insert(communities)
    .values({
      platform: 'reddit',
      identifier: `${PREFIX}r/Plumbing`,
      name: 'r/Plumbing',
    })
    .returning();
  const communityId = community!.id;

  const [plan] = await db
    .insert(contentPlans)
    .values({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 0,
      status: 'approved',
      generatedContent: 'Hello from test',
      scheduledAt: new Date(),
    })
    .returning();
  const contentPlanId = plan!.id;

  return { productId, legendId, legendAccountId, communityId, contentPlanId };
}

describe('ManualAdapter (integration)', () => {
  let ctx: TestContext;
  let adapter: ManualAdapter;

  beforeAll(async () => {
    adapter = new ManualAdapter(getDb());
  });

  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  beforeEach(async () => {
    await cleanup();
    ctx = await setupContext();
  });

  afterEach(cleanup);

  it('platform is "manual"', () => {
    expect(adapter.platform).toBe('manual');
  });

  it('createPost writes a posts row with null platform ids + pending status', async () => {
    const result = await adapter.createPost({
      contentPlanId: ctx.contentPlanId,
      legendAccountId: ctx.legendAccountId,
      communityId: ctx.communityId,
      content: 'Hello r/Plumbing',
      promotionLevel: 0,
      contentType: 'helpful_comment',
    });

    expect(result.status).toBe('pending_manual_post');
    expect(result.platformPostId).toBeNull();
    expect(result.platformUrl).toBeNull();
    expect(result.postId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.instructions).toContain('Copy the content');
    expect(result.instructions).toContain('r/Plumbing');

    // Verify the row exists with nulls
    const [row] = await getDb().select().from(posts).where(eq(posts.id, result.postId));
    expect(row?.platformPostId).toBeNull();
    expect(row?.platformUrl).toBeNull();
    expect(row?.postedAt).toBeNull();
    expect(row?.content).toBe('Hello r/Plumbing');
  });

  it('recordManualPost fills in platformPostId + url + postedAt', async () => {
    const result = await adapter.createPost({
      contentPlanId: ctx.contentPlanId,
      legendAccountId: ctx.legendAccountId,
      communityId: ctx.communityId,
      content: 'x',
      promotionLevel: 0,
      contentType: 'helpful_comment',
    });

    await adapter.recordManualPost(
      result.postId,
      't3_abc123',
      'https://reddit.com/r/Plumbing/comments/abc123',
    );

    const [row] = await getDb().select().from(posts).where(eq(posts.id, result.postId));
    expect(row?.platformPostId).toBe('t3_abc123');
    expect(row?.platformUrl).toBe('https://reddit.com/r/Plumbing/comments/abc123');
    expect(row?.postedAt).toBeInstanceOf(Date);
  });

  it('recordManualPost is idempotent (same id/url → no-op)', async () => {
    const result = await adapter.createPost({
      contentPlanId: ctx.contentPlanId,
      legendAccountId: ctx.legendAccountId,
      communityId: ctx.communityId,
      content: 'x',
      promotionLevel: 0,
      contentType: 'helpful_comment',
    });

    await adapter.recordManualPost(result.postId, 'id1', 'https://example.com/1');
    await adapter.recordManualPost(result.postId, 'id1', 'https://example.com/1');

    const [row] = await getDb().select().from(posts).where(eq(posts.id, result.postId));
    expect(row?.platformPostId).toBe('id1');
  });

  it('recordManualPost throws on unknown postId', async () => {
    await expect(
      adapter.recordManualPost(
        '00000000-0000-4000-8000-000000000000',
        'id',
        'https://example.com',
      ),
    ).rejects.toThrow(/not found/i);
  });

  it('createPost stores contentType + promotionLevel from params', async () => {
    const result = await adapter.createPost({
      contentPlanId: ctx.contentPlanId,
      legendAccountId: ctx.legendAccountId,
      communityId: ctx.communityId,
      content: 'x',
      promotionLevel: 4,
      contentType: 'experience_share',
    });

    const [row] = await getDb().select().from(posts).where(eq(posts.id, result.postId));
    expect(row?.contentType).toBe('experience_share');
    expect(row?.promotionLevel).toBe(4);
  });
});
```

- [ ] **Step 2.2: Run — MUST FAIL**

```bash
pnpm --filter @advocate/app test platforms/manual
```

- [ ] **Step 2.3: Implement `packages/app/src/platforms/manual.ts`**

```typescript
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { posts, communities } from '../db/schema.js';
import type * as schema from '../db/schema.js';
import type {
  CreatePostParams,
  PlatformAdapter,
  PlatformPostResult,
} from './types.js';

/**
 * Manual posting flow: we generate the content + persist the post row, then
 * hand the human instructions to copy-paste into the target platform. After
 * they actually post, `recordManualPost` fills in the platform ids.
 */
export class ManualAdapter implements PlatformAdapter {
  readonly platform = 'manual';

  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async createPost(params: CreatePostParams): Promise<PlatformPostResult> {
    // Fetch community name for the instruction text — non-fatal if missing.
    const [community] = await this.db
      .select()
      .from(communities)
      .where(eq(communities.id, params.communityId))
      .limit(1);

    const communityLabel = community?.name ?? 'target community';
    const platformLabel = community?.platform ?? 'the platform';

    const [row] = await this.db
      .insert(posts)
      .values({
        contentPlanId: params.contentPlanId,
        legendAccountId: params.legendAccountId,
        communityId: params.communityId,
        platformPostId: null,
        platformUrl: null,
        content: params.content,
        contentType: params.contentType,
        promotionLevel: params.promotionLevel,
        postedAt: null,
      })
      .returning();

    if (!row) {
      throw new Error('insert returned no row');
    }

    const instructions = [
      `Copy the content below.`,
      `Open ${platformLabel} and navigate to ${communityLabel}.`,
      params.parentPlatformId
        ? `Reply to: ${params.parentPlatformId}.`
        : `Create a new post${params.title ? ` titled "${params.title}"` : ''}.`,
      `Paste the content and submit.`,
      `Then confirm the URL via POST /posts/${row.id}/confirm (see dashboard).`,
      '',
      '--- CONTENT ---',
      params.content,
      '--- END CONTENT ---',
    ].join('\n');

    return {
      postId: row.id,
      platformPostId: null,
      platformUrl: null,
      status: 'pending_manual_post',
      instructions,
    };
  }

  async recordManualPost(
    postId: string,
    platformPostId: string,
    platformUrl: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(posts)
      .where(eq(posts.id, postId))
      .limit(1);
    if (!existing) {
      throw new Error(`Post ${postId} not found`);
    }

    // Idempotent: if already set with the same values, no update needed.
    if (
      existing.platformPostId === platformPostId &&
      existing.platformUrl === platformUrl
    ) {
      return;
    }

    await this.db
      .update(posts)
      .set({
        platformPostId,
        platformUrl,
        postedAt: existing.postedAt ?? new Date(),
      })
      .where(eq(posts.id, postId));
  }
}
```

- [ ] **Step 2.4: Run + commit**

```bash
pnpm --filter @advocate/app test platforms/manual
pnpm lint
git add packages/app/src/platforms/manual.ts packages/app/tests/platforms/manual.test.ts
git commit -m "feat(app): add ManualAdapter — generates instructions + records posts after manual submit"
```

---

## Task 3: RedditAdapter Stub

**Files:**
- Create: `packages/app/src/platforms/reddit.ts`
- Create: `packages/app/tests/platforms/reddit.test.ts`

- [ ] **Step 3.1: Write failing test FIRST**

```typescript
// reddit.test.ts
import { describe, expect, it } from 'vitest';
import { RedditAdapter } from '../../src/platforms/reddit.js';
import { NotImplementedYet } from '../../src/platforms/types.js';

describe('RedditAdapter (stub)', () => {
  it('platform is "reddit"', () => {
    const a = new RedditAdapter();
    expect(a.platform).toBe('reddit');
  });

  it('createPost throws NotImplementedYet with helpful message', async () => {
    const a = new RedditAdapter();
    await expect(
      a.createPost({
        contentPlanId: 'x',
        legendAccountId: 'x',
        communityId: 'x',
        content: 'x',
        promotionLevel: 0,
        contentType: 'helpful_comment',
      }),
    ).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('getPostMetrics also throws NotImplementedYet', async () => {
    const a = new RedditAdapter();
    await expect(a.getPostMetrics!('t3_abc')).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('getCommunityInfo also throws NotImplementedYet', async () => {
    const a = new RedditAdapter();
    await expect(a.getCommunityInfo!('r/Plumbing')).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('error message mentions fallback guidance', async () => {
    const a = new RedditAdapter();
    try {
      await a.createPost({
        contentPlanId: 'x',
        legendAccountId: 'x',
        communityId: 'x',
        content: 'x',
        promotionLevel: 0,
        contentType: 'helpful_comment',
      });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('ManualAdapter');
    }
  });
});
```

- [ ] **Step 3.2: Run — MUST FAIL**

- [ ] **Step 3.3: Implement `packages/app/src/platforms/reddit.ts`**

```typescript
import {
  NotImplementedYet,
  type CommunityProfile,
  type CreatePostParams,
  type PlatformAdapter,
  type PlatformPostResult,
  type PostMetrics,
} from './types.js';

/**
 * Stub adapter. Real snoowrap-backed implementation lands in a future plan
 * (Plan 10.5) once we have OAuth credentials + rate limiter wiring. For now
 * the stub exposes the shape so upstream agents can code against the type
 * and catch `NotImplementedYet` to fall back to `ManualAdapter`.
 */
export class RedditAdapter implements PlatformAdapter {
  readonly platform = 'reddit';

  async createPost(_params: CreatePostParams): Promise<PlatformPostResult> {
    throw new NotImplementedYet(this.platform, 'createPost');
  }

  async getPostMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    throw new NotImplementedYet(this.platform, 'getPostMetrics');
  }

  async getCommunityInfo(_identifier: string): Promise<CommunityProfile | null> {
    throw new NotImplementedYet(this.platform, 'getCommunityInfo');
  }
}
```

- [ ] **Step 3.4: Run + commit**

```bash
pnpm --filter @advocate/app test platforms/reddit
pnpm lint
git add packages/app/src/platforms/reddit.ts packages/app/tests/platforms/reddit.test.ts
git commit -m "feat(app): add RedditAdapter stub (throws NotImplementedYet; real impl deferred to Plan 10.5)"
```

---

## Task 4: Barrel + Docker Round-Trip + Tag

- [ ] **Step 4.1: Create barrel**

`packages/app/src/platforms/index.ts`:

```typescript
export * from './manual.js';
export * from './reddit.js';
export * from './registry.js';
export * from './types.js';
```

- [ ] **Step 4.2: Verify + commit + push**

```bash
pnpm --filter @advocate/app typecheck
pnpm --filter @advocate/app test
pnpm lint
```

Expected: ~181 (existing) + ~6 registry + ~5 manual + ~5 reddit ≈ 197 passing.

```bash
git add packages/app/src/platforms/index.ts
git commit -m "feat(app): expose platforms module via barrel"
git push origin master
```

- [ ] **Step 4.3: Docker round-trip**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

Expected `/health` JSON: `{"status":"ok","checks":{"database":true,"redis":true}}`.

- [ ] **Step 4.4: Tag + push**

```bash
git tag -a plan10-complete -m "Plan 10 Platform Adapters (Manual + Reddit stub) complete"
git push origin plan10-complete
```

---

## Acceptance Criteria

1. ✅ `PlatformAdapter` interface + `NotImplementedYet` error + supporting types
2. ✅ `PlatformRegistry` with register / get / require / platforms / unregister (6 tests)
3. ✅ `ManualAdapter` writes posts rows with null platform fields and returns readable instructions; `recordManualPost` fills them in idempotently (5 tests)
4. ✅ `RedditAdapter` stub throws `NotImplementedYet` with `ManualAdapter` fallback guidance in the message (5 tests)
5. ✅ Module exported via barrel
6. ✅ `pnpm verify` passes
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan10-complete` pushed

## Out of Scope

- **Real Reddit API integration** (OAuth, rate limiting, snoowrap calls) → Plan 10.5 when credentials are wired
- **Other platforms** (Twitter, Facebook, Dev.to, HN, LinkedIn, Quora) → individual plans as needed
- **Manual post confirmation HTTP route** (`POST /posts/:id/confirm`) → Plan 12 when we add API endpoints for posts
- **Webhook-based metrics polling** — background metric collection is Plan 11 Analytics agent

---

**End of Plan 10 (Platform Adapters).**
