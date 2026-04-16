# Gate Agents Implementation Plan (Plan 11b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two gate agents that sit between "content generated" and "content posted": **QualityGate** (LLM-scored review of a draft against 5 criteria) and **SafetyWorker** (rules-based rate-limit + policy checks). Both expose HTTP endpoints so the owner can verify them end-to-end; both follow the same BaseAgent pattern validated in Plan 11a.

**Architecture:** Two concrete agents extending `BaseAgent`. `QualityGate.review(input)` sends a structured JSON-output prompt to the LLM router (`classification` task type → Gemini Flash by default) and parses back a `QualityScore`. `SafetyWorker.check(input)` is pure SQL + arithmetic — no LLM. Both expose one Fastify route each. Later plans (11d, 11e) compose them into the main content pipeline.

**Tech Stack:** Existing router + BaseAgent + prompts module. No new dependencies.

**Prerequisites:**
- Plan 11a complete (tag `plan11a-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/app/src/agents/
├── quality-gate.ts                  # QualityGate agent — LLM-scored review
└── safety-worker.ts                 # SafetyWorker agent — rules-based rate/policy checks

packages/app/src/server/routes/
└── agents.ts                        # (existing) — extend with /agents/quality-gate/review + /agents/safety-worker/check

packages/app/tests/agents/
├── quality-gate.test.ts             # Integration with StubLLMProvider + captured JSON
├── quality-gate.http.test.ts        # Route test
├── safety-worker.test.ts            # Integration with real Postgres account state
└── safety-worker.http.test.ts       # Route test
```

## Design decisions

1. **QualityGate returns structured scores.** The LLM is asked to respond with a JSON object: `{authenticity, value, promotionalSmell, personaConsistency, communityFit, comments}`. The agent parses + validates with Zod and exposes a typed `QualityScore` + `approved: boolean`. Approval rule: `promotionalSmell <= 4` AND `authenticity >= 6` AND `value >= 5`.

2. **Prompt caching awareness.** The QualityGate system prompt is a static reviewer persona; the user prompt carries the draft + legend voice profile + community rules. The static prefix is long enough to benefit from Anthropic/Gemini prompt caching in production.

3. **SafetyWorker doesn't use the LLM.** It reads the `legend_accounts` row for the target account and evaluates several rules: account status, daily post limit, weekly post limit, minimum gap since last post, minimum cool-down since last product mention. All rules are configurable via options passed at construction.

4. **Separate HTTP endpoints keep each agent testable in isolation.** `/agents/quality-gate/review` and `/agents/safety-worker/check` return their respective shapes. Integration into the full `draft → review → safety → post` pipeline is Plan 11d.

5. **Zod parses LLM output strictly.** If the LLM returns invalid JSON or missing fields, `QualityGate` throws `QualityGateFormatError`. Route maps to 502 (bad gateway — downstream didn't cooperate).

---

## Task 1: QualityGate Agent

**Files:**
- Create: `packages/app/src/agents/quality-gate.ts`
- Create: `packages/app/tests/agents/quality-gate.test.ts`

- [ ] **Step 1.1: Write failing test FIRST**

Create `packages/app/tests/agents/quality-gate.test.ts`:

```typescript
import {
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  StubLLMProvider,
} from '@advocate/engine';
import pino from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import { QualityGate, QualityGateFormatError } from '../../src/agents/quality-gate.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDepsWithStub(stubContent: string): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: stubContent,
    usage: { inputTokens: 150, outputTokens: 40 },
    costMillicents: 5,
    latencyMs: 20,
  });
  return {
    router: new InMemoryLLMRouter({
      providers: [provider],
      tracker: new InMemoryBudgetTracker({ monthlyCapCents: 2000 }),
      config: {
        mode: 'primary',
        sensitiveTaskTypes: [],
        routes: {
          classification: {
            primary: { providerId: 'stub', model: 'stub-1' },
            fallback: { providerId: 'stub', model: 'stub-1' },
            budget: { providerId: 'stub', model: 'stub-1' },
          },
        },
      },
    }),
    // db is unused by QualityGate itself — it doesn't fetch rows.
    db: {} as AgentDeps['db'],
    logger: pino({ level: 'silent' }),
  };
}

const VALID_LLM_OUTPUT = JSON.stringify({
  authenticity: 9,
  value: 8,
  promotionalSmell: 2,
  personaConsistency: 9,
  communityFit: 8,
  comments: 'Reads natural; Dave-specific voice cues landed.',
});

describe('QualityGate', () => {
  it('parses a valid LLM response and returns approved=true', async () => {
    const gate = new QualityGate(makeDepsWithStub(VALID_LLM_OUTPUT));
    const result = await gate.review({
      draftContent: 'some draft',
      personaSummary: 'Dave, plumber, casual tone.',
      communityRules: 'No self-promotion.',
      promotionLevel: 3,
    });
    expect(result.approved).toBe(true);
    expect(result.score.authenticity).toBe(9);
    expect(result.score.promotionalSmell).toBe(2);
    expect(result.comments).toContain('Dave-specific');
  });

  it('approved=false when promotionalSmell > 4 at low promotion level', async () => {
    const rejecty = JSON.stringify({
      authenticity: 9,
      value: 8,
      promotionalSmell: 6,
      personaConsistency: 9,
      communityFit: 8,
      comments: 'Too promotional.',
    });
    const gate = new QualityGate(makeDepsWithStub(rejecty));
    const result = await gate.review({
      draftContent: 'shill post',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 1,
    });
    expect(result.approved).toBe(false);
  });

  it('approved=false when authenticity < 6', async () => {
    const low = JSON.stringify({
      authenticity: 4,
      value: 8,
      promotionalSmell: 1,
      personaConsistency: 7,
      communityFit: 7,
      comments: 'Sounds robotic.',
    });
    const gate = new QualityGate(makeDepsWithStub(low));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(false);
  });

  it('approved=false when value < 5', async () => {
    const low = JSON.stringify({
      authenticity: 8,
      value: 3,
      promotionalSmell: 2,
      personaConsistency: 7,
      communityFit: 7,
      comments: 'No useful content.',
    });
    const gate = new QualityGate(makeDepsWithStub(low));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(false);
  });

  it('allows high promotionalSmell at high promotion level', async () => {
    const output = JSON.stringify({
      authenticity: 9,
      value: 8,
      promotionalSmell: 6,
      personaConsistency: 8,
      communityFit: 8,
      comments: 'Product mention is central; appropriate for level 7.',
    });
    const gate = new QualityGate(makeDepsWithStub(output));
    const result = await gate.review({
      draftContent: 'product pitch',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 7,
    });
    expect(result.approved).toBe(true);
  });

  it('throws QualityGateFormatError on malformed LLM JSON', async () => {
    const gate = new QualityGate(makeDepsWithStub('not json at all'));
    await expect(
      gate.review({
        draftContent: 'x',
        personaSummary: 'Dave',
        communityRules: '',
        promotionLevel: 0,
      }),
    ).rejects.toBeInstanceOf(QualityGateFormatError);
  });

  it('throws QualityGateFormatError when required fields are missing', async () => {
    const bad = JSON.stringify({ authenticity: 9, value: 8 }); // missing 3 fields
    const gate = new QualityGate(makeDepsWithStub(bad));
    await expect(
      gate.review({
        draftContent: 'x',
        personaSummary: 'Dave',
        communityRules: '',
        promotionLevel: 0,
      }),
    ).rejects.toBeInstanceOf(QualityGateFormatError);
  });

  it('strips leading/trailing markdown code fences from LLM output', async () => {
    const fenced = '```json\n' + VALID_LLM_OUTPUT + '\n```';
    const gate = new QualityGate(makeDepsWithStub(fenced));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(true);
  });

  it('reports raw LLM response in result for debugging', async () => {
    const gate = new QualityGate(makeDepsWithStub(VALID_LLM_OUTPUT));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.llm.providerId).toBe('stub');
    expect(result.llm.costMillicents).toBe(5);
  });
});
```

- [ ] **Step 1.2: Run — MUST FAIL**

```bash
pnpm --filter @advocate/app test quality-gate
```

- [ ] **Step 1.3: Implement `packages/app/src/agents/quality-gate.ts`**

```typescript
import { z } from 'zod';
import { BaseAgent } from './base-agent.js';

export class QualityGateFormatError extends Error {
  constructor(public readonly rawResponse: string, cause?: unknown) {
    super(
      `Quality gate LLM returned malformed output. First 200 chars: ${rawResponse.slice(0, 200)}`,
    );
    this.name = 'QualityGateFormatError';
    if (cause) this.cause = cause;
  }
}

export interface QualityGateInput {
  draftContent: string;
  /** One-paragraph summary of the persona's voice — callers can pass the Soul prompt prefix. */
  personaSummary: string;
  /** Community rules / culture summary for judging community fit. */
  communityRules: string;
  /** The promotion level this draft was generated for (0-10). Affects approval threshold. */
  promotionLevel: number;
}

export interface QualityScore {
  authenticity: number;
  value: number;
  promotionalSmell: number;
  personaConsistency: number;
  communityFit: number;
}

export interface QualityGateResult {
  approved: boolean;
  score: QualityScore;
  comments: string;
  llm: {
    providerId: string;
    model: string;
    costMillicents: number;
    latencyMs: number;
  };
}

const scoreSchema = z.object({
  authenticity: z.number().min(1).max(10),
  value: z.number().min(1).max(10),
  promotionalSmell: z.number().min(1).max(10),
  personaConsistency: z.number().min(1).max(10),
  communityFit: z.number().min(1).max(10),
  comments: z.string(),
});

const SYSTEM_PROMPT = `You are a content quality reviewer for an organic community promotion system. Your job is to score a draft post against five criteria and return ONLY a JSON object — no prose before or after.

Score each criterion 1–10:
- authenticity: Does this read like a real human wrote it? (10 = indistinguishable from genuine)
- value: Would the community find this genuinely helpful or interesting? (10 = highly valuable)
- promotionalSmell: How promotional does it feel? (10 = obvious ad, 1 = pure value, no promo)
- personaConsistency: Does this match the described persona's voice? (10 = perfect voice match)
- communityFit: Does this match the community's culture and rules? (10 = perfect fit)

Also return:
- comments: one or two sentences summarizing your overall assessment

Respond with ONLY the JSON object. No markdown fences, no prose.`;

export class QualityGate extends BaseAgent {
  readonly name = 'quality-gate';

  async review(input: QualityGateInput): Promise<QualityGateResult> {
    const userPrompt = [
      `DRAFT:\n${input.draftContent}`,
      '',
      `PERSONA SUMMARY:\n${input.personaSummary}`,
      '',
      `COMMUNITY CONTEXT:\n${input.communityRules || '(no specific rules provided)'}`,
      '',
      `PROMOTION LEVEL: ${input.promotionLevel}/10`,
      '',
      'Return the JSON score object now.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 500,
    });

    const parsed = this.#parseScore(response.content);

    const approved = this.#isApproved(parsed, input.promotionLevel);

    return {
      approved,
      score: {
        authenticity: parsed.authenticity,
        value: parsed.value,
        promotionalSmell: parsed.promotionalSmell,
        personaConsistency: parsed.personaConsistency,
        communityFit: parsed.communityFit,
      },
      comments: parsed.comments,
      llm: {
        providerId: response.providerId,
        model: response.model,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }

  #parseScore(raw: string): z.infer<typeof scoreSchema> {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(stripped);
    } catch (err) {
      throw new QualityGateFormatError(raw, err);
    }

    const result = scoreSchema.safeParse(json);
    if (!result.success) {
      throw new QualityGateFormatError(raw, result.error);
    }
    return result.data;
  }

  #isApproved(score: z.infer<typeof scoreSchema>, promotionLevel: number): boolean {
    // Below promotion level 7, a promo smell > 4 means the draft feels like an ad.
    if (promotionLevel < 7 && score.promotionalSmell > 4) return false;
    if (score.authenticity < 6) return false;
    if (score.value < 5) return false;
    return true;
  }
}
```

- [ ] **Step 1.4: Run + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/app test quality-gate
pnpm lint
git add packages/app/src/agents/quality-gate.ts packages/app/tests/agents/quality-gate.test.ts
git commit -m "feat(app): add QualityGate agent (LLM-scored draft review, 5 criteria)"
```

---

## Task 2: SafetyWorker Agent

**Files:**
- Create: `packages/app/src/agents/safety-worker.ts`
- Create: `packages/app/tests/agents/safety-worker.test.ts`

- [ ] **Step 2.1: Write failing integration test FIRST**

Create `packages/app/tests/agents/safety-worker.test.ts`:

```typescript
import { eq, like } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';
import { SafetyWorker } from '../../src/agents/safety-worker.js';
import type { AgentDeps } from '../../src/agents/types.js';

const PREFIX = 'canary-safety-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

function makeDeps(): AgentDeps {
  return {
    // Safety worker doesn't call the router; pass a minimal shape.
    router: {} as AgentDeps['router'],
    db: getDb(),
    logger: pino({ level: 'silent' }),
  };
}

interface TestCtx {
  legendAccountId: string;
}

async function setupAccount(overrides: Partial<typeof legendAccounts.$inferInsert> = {}): Promise<TestCtx> {
  const db = getDb();
  const [product] = await db
    .insert(products)
    .values({
      name: 'x',
      slug: `${PREFIX}product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: 'x',
      status: 'draft',
      valueProps: [], painPoints: [], talkingPoints: [],
    })
    .returning();
  const productId = product!.id;

  const [legend] = await db
    .insert(legends)
    .values({
      productId,
      firstName: `${PREFIX}x`,
      lastName: 'y',
      gender: 'male', age: 30,
      location: { city: 'x', state: 'x', country: 'USA', timezone: 'UTC' },
      lifeDetails: { maritalStatus: 'single' },
      professional: { occupation: 'x', company: 'x', industry: 'x', yearsExperience: 1, education: 'x' },
      bigFive: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
      techSavviness: 5,
      typingStyle: {
        capitalization: 'proper', punctuation: 'correct', commonTypos: [], commonPhrases: [],
        avoidedPhrases: [], paragraphStyle: 'short', listStyle: 'never', usesEmojis: false, formality: 5,
      },
      activeHours: { start: 9, end: 17 }, activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'short', hobbies: ['x'],
      expertiseAreas: ['x'], knowledgeGaps: [],
      productRelationship: {
        discoveryStory: 'x', usageDuration: '1m', satisfactionLevel: 7, complaints: [],
        useCase: 'x', alternativesConsidered: [],
      },
      opinions: {}, neverDo: [],
      maturity: 'lurking',
    })
    .returning();

  const [account] = await db
    .insert(legendAccounts)
    .values({
      legendId: legend!.id,
      platform: 'reddit',
      username: `${PREFIX}acc${Math.random().toString(36).slice(2, 7)}`,
      ...overrides,
    })
    .returning();

  return { legendAccountId: account!.id };
}

describe('SafetyWorker (integration)', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);
  afterEach(cleanup);

  it('allows a post when account is fresh', async () => {
    const { legendAccountId } = await setupAccount({ status: 'active' });
    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({
      legendAccountId,
      promotionLevel: 0,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when account status is suspended', async () => {
    const { legendAccountId } = await setupAccount({ status: 'suspended' });
    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({
      legendAccountId,
      promotionLevel: 0,
    });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/status|suspended/i);
  });

  it('blocks when account status is banned', async () => {
    const { legendAccountId } = await setupAccount({ status: 'banned' });
    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(false);
  });

  it('blocks when daily post limit reached', async () => {
    const { legendAccountId } = await setupAccount({
      status: 'active',
      postsToday: 3, // default daily limit is 3
    });
    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/daily|posts today/i);
  });

  it('blocks when weekly post limit reached', async () => {
    const { legendAccountId } = await setupAccount({
      status: 'active',
      postsThisWeek: 15, // default weekly limit is 15
    });
    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/week/i);
  });

  it('blocks within minimum gap since last post', async () => {
    const db = getDb();
    const { legendAccountId } = await setupAccount({ status: 'active' });
    await db
      .update(legendAccounts)
      .set({ lastPostAt: new Date() })
      .where(eq(legendAccounts.id, legendAccountId));

    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/gap|too soon/i);
    expect(result.nextPossibleAt).toBeDefined();
  });

  it('blocks when product mention cool-down not elapsed (promotionLevel >= 4)', async () => {
    const db = getDb();
    const { legendAccountId } = await setupAccount({ status: 'active' });
    await db
      .update(legendAccounts)
      .set({ lastProductMentionAt: new Date() })
      .where(eq(legendAccounts.id, legendAccountId));

    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 5 });
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/mention|cool/i);
  });

  it('allows promotion level 0 even if product-mention cool-down not elapsed', async () => {
    const db = getDb();
    const { legendAccountId } = await setupAccount({ status: 'active' });
    await db
      .update(legendAccounts)
      .set({ lastProductMentionAt: new Date() })
      .where(eq(legendAccounts.id, legendAccountId));

    const worker = new SafetyWorker(makeDeps());
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(true);
  });

  it('throws when account is not found', async () => {
    const worker = new SafetyWorker(makeDeps());
    await expect(
      worker.check({
        legendAccountId: '00000000-0000-4000-8000-000000000000',
        promotionLevel: 0,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('respects custom limits passed at construction', async () => {
    const { legendAccountId } = await setupAccount({
      status: 'active',
      postsToday: 1,
    });
    const worker = new SafetyWorker(makeDeps(), { maxPostsPerDay: 1 });
    const result = await worker.check({ legendAccountId, promotionLevel: 0 });
    expect(result.allowed).toBe(false);
  });
});
```

- [ ] **Step 2.2: Run — MUST FAIL**

```bash
pnpm --filter @advocate/app test safety-worker
```

- [ ] **Step 2.3: Implement `packages/app/src/agents/safety-worker.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { legendAccounts } from '../db/schema.js';
import { BaseAgent } from './base-agent.js';
import type { AgentDeps } from './types.js';

export interface SafetyWorkerLimits {
  /** Max posts per day per account. */
  maxPostsPerDay: number;
  /** Max posts per week per account. */
  maxPostsPerWeek: number;
  /** Minimum gap (ms) since the last post on this account. */
  minGapBetweenPostsMs: number;
  /** Minimum cool-down (ms) since the last PRODUCT MENTION before another one is allowed. */
  minGapBetweenProductMentionsMs: number;
  /** promotionLevel >= this value is considered a product mention. */
  productMentionThreshold: number;
}

const DEFAULT_LIMITS: SafetyWorkerLimits = {
  maxPostsPerDay: 3,
  maxPostsPerWeek: 15,
  minGapBetweenPostsMs: 2 * 60 * 60 * 1000, // 2 hours
  minGapBetweenProductMentionsMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  productMentionThreshold: 4,
};

export interface SafetyCheckInput {
  legendAccountId: string;
  /** 0–10 per the promotion gradient. */
  promotionLevel: number;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  /** When the blocking condition is expected to clear (e.g. gap elapsed). */
  nextPossibleAt?: Date;
}

/**
 * Rules-based gate. No LLM calls. Reads the account row and evaluates limits.
 */
export class SafetyWorker extends BaseAgent {
  readonly name = 'safety-worker';
  readonly #limits: SafetyWorkerLimits;

  constructor(deps: AgentDeps, limits: Partial<SafetyWorkerLimits> = {}) {
    super(deps);
    this.#limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const [account] = await this.deps.db
      .select()
      .from(legendAccounts)
      .where(eq(legendAccounts.id, input.legendAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`Legend account ${input.legendAccountId} not found`);
    }

    // Account status gate — only `active` + `warming_up` can post.
    if (account.status !== 'active' && account.status !== 'warming_up') {
      return {
        allowed: false,
        reason: `Account status is ${account.status}; posting blocked`,
      };
    }

    // Daily posts cap
    if (account.postsToday >= this.#limits.maxPostsPerDay) {
      return {
        allowed: false,
        reason: `Daily post cap reached (${account.postsToday}/${this.#limits.maxPostsPerDay} posts today)`,
      };
    }

    // Weekly posts cap
    if (account.postsThisWeek >= this.#limits.maxPostsPerWeek) {
      return {
        allowed: false,
        reason: `Weekly post cap reached (${account.postsThisWeek}/${this.#limits.maxPostsPerWeek} posts this week)`,
      };
    }

    // Minimum gap since last post
    if (account.lastPostAt) {
      const elapsed = Date.now() - account.lastPostAt.getTime();
      if (elapsed < this.#limits.minGapBetweenPostsMs) {
        const nextPossibleAt = new Date(account.lastPostAt.getTime() + this.#limits.minGapBetweenPostsMs);
        return {
          allowed: false,
          reason: `Gap too soon since last post (${Math.round(elapsed / 60000)} min elapsed, ${Math.round(this.#limits.minGapBetweenPostsMs / 60000)} min required)`,
          nextPossibleAt,
        };
      }
    }

    // Product-mention cool-down
    if (
      input.promotionLevel >= this.#limits.productMentionThreshold &&
      account.lastProductMentionAt
    ) {
      const elapsed = Date.now() - account.lastProductMentionAt.getTime();
      if (elapsed < this.#limits.minGapBetweenProductMentionsMs) {
        const nextPossibleAt = new Date(
          account.lastProductMentionAt.getTime() + this.#limits.minGapBetweenProductMentionsMs,
        );
        return {
          allowed: false,
          reason: `Product mention cool-down not elapsed (${Math.round(elapsed / 3600000)}h since last mention, ${Math.round(this.#limits.minGapBetweenProductMentionsMs / 3600000)}h required)`,
          nextPossibleAt,
        };
      }
    }

    return { allowed: true };
  }
}
```

- [ ] **Step 2.4: Run + commit**

```bash
pnpm --filter @advocate/app test safety-worker
pnpm lint
git add packages/app/src/agents/safety-worker.ts packages/app/tests/agents/safety-worker.test.ts
git commit -m "feat(app): add SafetyWorker agent (rules-based rate + mention cool-down checks)"
```

---

## Task 3: HTTP Routes for Both Agents

**Files:**
- Modify: `packages/app/src/server/routes/agents.ts` — add the two endpoints
- Create: `packages/app/tests/agents/quality-gate.http.test.ts`
- Create: `packages/app/tests/agents/safety-worker.http.test.ts`

- [ ] **Step 3.1: Extend `packages/app/src/server/routes/agents.ts`**

Add after the existing `POST /agents/content-writer/draft` handler, inside `registerAgentRoutes`:

```typescript
// Build instances once per server (router + db are stable)
const qualityGate = new QualityGate({
  router: deps.router,
  db: getDb(),
  logger: deps.logger,
});
const safetyWorker = new SafetyWorker({
  router: deps.router,
  db: getDb(),
  logger: deps.logger,
});

const qualityReviewSchema = z.object({
  draftContent: z.string().min(1),
  personaSummary: z.string().min(1),
  communityRules: z.string(),
  promotionLevel: z.number().int().min(0).max(10),
});

app.post('/agents/quality-gate/review', async (req, reply) => {
  const parsed = qualityReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'ValidationError',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  try {
    return await qualityGate.review(parsed.data);
  } catch (err) {
    if (err instanceof QualityGateFormatError) {
      return reply.code(502).send({
        error: 'BadGateway',
        message: 'LLM returned malformed scoring response',
        rawPreview: err.rawResponse.slice(0, 300),
      });
    }
    req.log.error({ err }, 'quality gate failed');
    return reply.code(500).send({ error: 'InternalServerError' });
  }
});

const safetyCheckSchema = z.object({
  legendAccountId: z.string().uuid(),
  promotionLevel: z.number().int().min(0).max(10),
});

app.post('/agents/safety-worker/check', async (req, reply) => {
  const parsed = safetyCheckSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'ValidationError',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  try {
    return await safetyWorker.check(parsed.data);
  } catch (err) {
    if (err instanceof Error && /not found/i.test(err.message)) {
      return reply.code(404).send({ error: 'NotFound', message: err.message });
    }
    req.log.error({ err }, 'safety worker failed');
    return reply.code(500).send({ error: 'InternalServerError' });
  }
});
```

Also add the necessary imports at the top:

```typescript
import { QualityGate, QualityGateFormatError } from '../../agents/quality-gate.js';
import { SafetyWorker } from '../../agents/safety-worker.js';
```

- [ ] **Step 3.2: Write integration tests**

Create `packages/app/tests/agents/quality-gate.http.test.ts` covering:
- POST valid payload → 200 with `approved` + `score` + `comments`
- POST missing fields → 400
- (Optional) with a real LLM key → integration test that skips otherwise

Create `packages/app/tests/agents/safety-worker.http.test.ts` covering:
- POST valid with fresh account → 200 `allowed: true`
- POST with invalid UUID → 400
- POST with missing account → 404

Both use the `buildServer()` + `app.inject()` pattern from the existing agents.integration.test.ts.

- [ ] **Step 3.3: Run + commit + push**

```bash
pnpm --filter @advocate/app test agents
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/agents.ts packages/app/tests/agents/quality-gate.http.test.ts packages/app/tests/agents/safety-worker.http.test.ts
git commit -m "feat(app): add /agents/quality-gate/review + /agents/safety-worker/check routes"
git push origin master
```

---

## Task 4: Docker Round-Trip + Tag

- [ ] **Step 4.1: Docker round-trip**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

- [ ] **Step 4.2: Tag + push**

```bash
git tag -a plan11b-complete -m "Plan 11b Quality Gate + Safety Worker agents complete"
git push origin plan11b-complete
```

---

## Acceptance Criteria

1. ✅ `QualityGate.review(input)` returns structured `QualityScore` + `approved` boolean + comments
2. ✅ QualityGate approval rule: `promotionalSmell <= 4 OR promotionLevel >= 7`, plus `authenticity >= 6`, `value >= 5`
3. ✅ QualityGate throws `QualityGateFormatError` on malformed JSON, caught by route → 502
4. ✅ `SafetyWorker.check(input)` enforces status + daily + weekly + gap + mention-cool-down rules with configurable limits
5. ✅ `POST /agents/quality-gate/review` + `POST /agents/safety-worker/check` endpoints live
6. ✅ Tests: ~9 QualityGate unit + ~10 SafetyWorker integration + HTTP tests
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan11b-complete` pushed

## Out of Scope

- **End-to-end pipeline** (draft → review → safety → post) → Plan 11d wires these together
- **Scout + Analytics Analyst agents** → separate plan when needed
- **Strategist + Campaign Lead** (the orchestrators) → Plan 11c
- **BullMQ runtime** → Plan 11e
- **Auth** → Plan 12

---

**End of Plan 11b (Gate Agents).**
