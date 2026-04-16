import { like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ContentPlanRepository } from '../../src/content-plans/content-plan.repository.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  communities,
  contentPlans,
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';

const PREFIX = 'canary-cplan-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(contentPlans).where(like(contentPlans.threadUrl, `${PREFIX}%`));
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${PREFIX}%`));
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(communities).where(like(communities.name, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

async function setupContext(): Promise<{
  productId: string;
  legendId: string;
  legendAccountId: string;
  communityId: string;
}> {
  const db = getDb();

  const [product] = await db
    .insert(products)
    .values({
      name: 'Test Product',
      slug: `${PREFIX}product-${Date.now()}`,
      description: 'Test product',
      status: 'active',
      valueProps: ['test'],
      painPoints: ['test'],
      talkingPoints: ['test'],
    })
    .returning();
  if (!product?.id) throw new Error('Product creation failed');

  const [legend] = await db
    .insert(legends)
    .values({
      productId: product.id,
      firstName: `${PREFIX}Alice`,
      lastName: 'Tester',
      gender: 'female',
      age: 30,
      location: { city: 'Austin', state: 'TX', country: 'USA', timezone: 'America/Chicago' },
      lifeDetails: { maritalStatus: 'single' },
      professional: {
        occupation: 'Engineer',
        company: 'TechCo',
        industry: 'Tech',
        yearsExperience: 5,
        education: 'Bachelors',
      },
      bigFive: {
        openness: 7,
        conscientiousness: 8,
        extraversion: 6,
        agreeableness: 7,
        neuroticism: 3,
      },
      techSavviness: 8,
      typingStyle: {
        capitalization: 'normal',
        punctuation: 'standard',
        commonTypos: [],
        commonPhrases: [],
        avoidedPhrases: [],
        paragraphStyle: 'concise',
        listStyle: 'often',
        usesEmojis: false,
        formality: 6,
      },
      activeHours: { start: 9, end: 17 },
      activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'medium',
      hobbies: ['coding'],
      expertiseAreas: ['backend', 'databases'],
      knowledgeGaps: ['design'],
      productRelationship: {
        discoveryStory: 'Found it online',
        usageDuration: '6 months',
        satisfactionLevel: 9,
        complaints: [],
        useCase: 'daily work',
        alternativesConsidered: [],
      },
      opinions: {},
      neverDo: ['oversell'],
      maturity: 'engaging',
    })
    .returning();
  if (!legend?.id) throw new Error('Legend creation failed');

  const [community] = await db
    .insert(communities)
    .values({
      platform: 'reddit',
      identifier: `${PREFIX}test_${Date.now()}`,
      name: `${PREFIX}r/test`,
      url: `${PREFIX}https://reddit.com/r/test`,
      cultureSummary: 'Test community',
      rulesSummary: 'Be respectful',
      status: 'active',
    })
    .returning();
  if (!community?.id) throw new Error('Community creation failed');

  const [account] = await db
    .insert(legendAccounts)
    .values({
      legendId: legend.id,
      platform: 'reddit',
      username: `${PREFIX}alice_account`,
      warmUpPhase: 'engaging',
      status: 'active',
    })
    .returning();
  if (!account?.id) throw new Error('Account creation failed');

  return {
    productId: product.id,
    legendId: legend.id,
    legendAccountId: account.id,
    communityId: community.id,
  };
}

describe('ContentPlanRepository', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('creates and returns a content plan with id + timestamps', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    const now = new Date();
    const result = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 2,
      scheduledAt: now,
      status: 'planned',
      generatedContent: 'Great response!',
    });

    expect(result.id).toBeDefined();
    expect(result.legendId).toBe(legendId);
    expect(result.legendAccountId).toBe(legendAccountId);
    expect(result.communityId).toBe(communityId);
    expect(result.contentType).toBe('helpful_comment');
    expect(result.promotionLevel).toBe(2);
    expect(result.status).toBe('planned');
    expect(result.generatedContent).toBe('Great response!');
    expect(result.createdAt).toBeDefined();
  });

  it('finds by id and returns null for missing id', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    const created = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'value_post',
      promotionLevel: 3,
      scheduledAt: new Date(),
      status: 'approved',
    });

    const found = await repo.findById(created.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(created.id);

    const notFound = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(notFound).toBeNull();
  });

  it('lists by legend filtering', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    const plan1 = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 0,
      scheduledAt: new Date(),
      status: 'planned',
    });

    const plan2 = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'recommendation',
      promotionLevel: 5,
      scheduledAt: new Date(),
      status: 'approved',
    });

    const results = await repo.listByLegend(legendId);
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results.some((p) => p.id === plan1.id)).toBe(true);
    expect(results.some((p) => p.id === plan2.id)).toBe(true);
  });

  it('lists by status with optional legend filter', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 1,
      scheduledAt: new Date(),
      status: 'approved',
    });

    await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'value_post',
      promotionLevel: 2,
      scheduledAt: new Date(),
      status: 'rejected',
    });

    const approved = await repo.listByStatus('approved');
    expect(approved.length).toBeGreaterThan(0);
    expect(approved.every((p) => p.status === 'approved')).toBe(true);

    const approvedForLegend = await repo.listByStatus('approved', { legendId });
    expect(approvedForLegend.every((p) => p.legendId === legendId)).toBe(true);
  });

  it('updates and returns updated plan', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    const created = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 0,
      scheduledAt: new Date(),
      status: 'planned',
    });

    const updated = await repo.update(created.id, {
      status: 'approved',
      reviewedBy: 'orchestrator',
      reviewedAt: new Date(),
      qualityScore: { value: 8.5, authenticity: 9 },
    });

    expect(updated).toBeDefined();
    expect(updated?.status).toBe('approved');
    expect(updated?.reviewedBy).toBe('orchestrator');
    expect(updated?.qualityScore).toEqual({ value: 8.5, authenticity: 9 });
  });

  it('updates returns null for missing id', async () => {
    const repo = new ContentPlanRepository(getDb());
    const result = await repo.update('00000000-0000-0000-0000-000000000000', {
      status: 'approved',
    });
    expect(result).toBeNull();
  });

  it('removes a plan and returns boolean', async () => {
    const { legendId, legendAccountId, communityId } = await setupContext();
    const repo = new ContentPlanRepository(getDb());

    const created = await repo.create({
      legendId,
      legendAccountId,
      communityId,
      contentType: 'helpful_comment',
      promotionLevel: 0,
      scheduledAt: new Date(),
      status: 'planned',
    });

    const removed = await repo.remove(created.id);
    expect(removed).toBe(true);

    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('remove returns false for missing id', async () => {
    const repo = new ContentPlanRepository(getDb());
    const result = await repo.remove('00000000-0000-0000-0000-000000000000');
    expect(result).toBe(false);
  });
});
