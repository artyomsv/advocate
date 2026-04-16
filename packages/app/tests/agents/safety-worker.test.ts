import { eq, like } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SafetyWorker } from '../../src/agents/safety-worker.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';
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

async function setupAccount(
  overrides: Partial<typeof legendAccounts.$inferInsert> = {},
): Promise<TestCtx> {
  const db = getDb();
  const [product] = await db
    .insert(products)
    .values({
      name: 'x',
      slug: `${PREFIX}product-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      description: 'x',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    })
    .returning();
  const productId = product?.id;
  if (!productId) throw new Error('Product creation failed');

  const [legend] = await db
    .insert(legends)
    .values({
      productId,
      firstName: `${PREFIX}x`,
      lastName: 'y',
      gender: 'male',
      age: 30,
      location: { city: 'x', state: 'x', country: 'USA', timezone: 'UTC' },
      lifeDetails: { maritalStatus: 'single' },
      professional: {
        occupation: 'x',
        company: 'x',
        industry: 'x',
        yearsExperience: 1,
        education: 'x',
      },
      bigFive: {
        openness: 5,
        conscientiousness: 5,
        extraversion: 5,
        agreeableness: 5,
        neuroticism: 5,
      },
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
        usageDuration: '1m',
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
  const legendId = legend?.id;
  if (!legendId) throw new Error('Legend creation failed');

  const [account] = await db
    .insert(legendAccounts)
    .values({
      legendId,
      platform: 'reddit',
      username: `${PREFIX}acc${Math.random().toString(36).slice(2, 7)}`,
      ...overrides,
    })
    .returning();
  const accountId = account?.id;
  if (!accountId) throw new Error('Account creation failed');

  return { legendAccountId: accountId };
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
