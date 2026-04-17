import { like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ContentPlanService } from '../../src/content-plans/content-plan.service.js';
import {
  ContentPlanNotFoundError,
  IllegalStatusTransitionError,
} from '../../src/content-plans/errors.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  communities,
  contentPlans,
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';

const PREFIX = `canary-cplan-svc-${Date.now()}-`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(contentPlans).where(like(contentPlans.threadUrl, `${PREFIX}%`));
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${PREFIX}%`));
  await db.delete(communities).where(like(communities.identifier, `${PREFIX}%`));
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

async function seed(): Promise<{ contentPlanId: string }> {
  const db = getDb();
  const [p] = await db
    .insert(products)
    .values({
      name: 'P',
      slug: `${PREFIX.replace(/[:.]/g, '-')}p`.toLowerCase().slice(0, 100),
      description: 'd',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    })
    .returning();
  if (!p) throw new Error('product insert failed');

  const [l] = await db
    .insert(legends)
    .values({
      productId: p.id,
      firstName: `${PREFIX}A`,
      lastName: 'B',
      gender: 'female',
      age: 30,
      location: { city: 'X', state: 'Y', country: 'Z', timezone: 'UTC' },
      lifeDetails: { maritalStatus: 'single' },
      professional: {
        occupation: 'o',
        company: 'c',
        industry: 'i',
        yearsExperience: 1,
        education: 'e',
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
        paragraphStyle: 'varied',
        listStyle: 'sometimes',
        usesEmojis: false,
        formality: 5,
      },
      activeHours: { start: 8, end: 22 },
      activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'short',
      hobbies: ['h'],
      expertiseAreas: ['e'],
      knowledgeGaps: [],
      opinions: {},
      neverDo: [],
      productRelationship: {
        discoveryStory: 'ds',
        usageDuration: '1mo',
        satisfactionLevel: 5,
        complaints: [],
        useCase: 'uc',
        alternativesConsidered: [],
      },
    })
    .returning();
  if (!l) throw new Error('legend insert failed');

  const [a] = await db
    .insert(legendAccounts)
    .values({
      legendId: l.id,
      platform: 'reddit',
      username: `${PREFIX}u`,
      status: 'active',
    })
    .returning();
  if (!a) throw new Error('account insert failed');

  const [c] = await db
    .insert(communities)
    .values({
      platform: 'reddit',
      identifier: `${PREFIX}c`,
      name: 'comm',
      status: 'active',
    })
    .returning();
  if (!c) throw new Error('community insert failed');

  const [cp] = await db
    .insert(contentPlans)
    .values({
      legendId: l.id,
      legendAccountId: a.id,
      communityId: c.id,
      contentType: 'value_post',
      promotionLevel: 1,
      threadUrl: `${PREFIX}thread`,
      scheduledAt: new Date(),
      status: 'review',
    })
    .returning();
  if (!cp) throw new Error('content_plan insert failed');
  return { contentPlanId: cp.id };
}

describe('ContentPlanService', () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('approve transitions review → approved', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    const updated = await svc.approve(contentPlanId);
    expect(updated.status).toBe('approved');
  });

  it('reject transitions review → rejected', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    const updated = await svc.reject(contentPlanId);
    expect(updated.status).toBe('rejected');
  });

  it('throws IllegalStatusTransitionError when already approved', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    await svc.approve(contentPlanId);
    await expect(svc.approve(contentPlanId)).rejects.toBeInstanceOf(IllegalStatusTransitionError);
  });

  it('throws NotFound for unknown id', async () => {
    const svc = new ContentPlanService(getDb());
    await expect(svc.get('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      ContentPlanNotFoundError,
    );
  });

  it('listByStatus filters by status', async () => {
    await seed();
    const svc = new ContentPlanService(getDb());
    const rows = await svc.listByStatus('review');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
