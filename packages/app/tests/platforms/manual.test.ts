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
      adapter.recordManualPost('00000000-0000-4000-8000-000000000000', 'id', 'https://example.com'),
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
