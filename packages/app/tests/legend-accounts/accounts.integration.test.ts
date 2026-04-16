import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legendAccounts, legends, products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const CANARY_HTTP_PREFIX = 'canary-account-http-';
const CANARY_PRODUCT_PREFIX = 'canary-account-parent-';

async function cleanupAccounts(): Promise<void> {
  const db = getDb();
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${CANARY_HTTP_PREFIX}%`));
}

async function cleanupLegends(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${CANARY_HTTP_PREFIX}%`));
}

async function cleanupProducts(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${CANARY_PRODUCT_PREFIX}%`));
}

function makeLegendInput(productId: string) {
  return {
    productId,
    firstName: `${CANARY_HTTP_PREFIX}legend`,
    lastName: 'Test',
    gender: 'male' as const,
    age: 30,
    location: { city: 'SF', state: 'CA', country: 'USA', timezone: 'UTC' },
    lifeDetails: { maritalStatus: 'single' as const },
    professional: {
      occupation: 'Dev',
      company: 'Test Corp',
      industry: 'Software',
      yearsExperience: 5,
      education: 'BS',
    },
    bigFive: {
      openness: 7,
      conscientiousness: 8,
      extraversion: 6,
      agreeableness: 7,
      neuroticism: 4,
    },
    techSavviness: 8,
    typingStyle: {
      capitalization: 'proper' as const,
      punctuation: 'correct' as const,
      commonTypos: [],
      commonPhrases: [],
      avoidedPhrases: [],
      paragraphStyle: 'varied' as const,
      listStyle: 'sometimes' as const,
      usesEmojis: false,
      formality: 6,
    },
    activeHours: { start: 9, end: 17 },
    activeDays: [1, 2, 3, 4, 5],
    averagePostLength: 'medium' as const,
    hobbies: ['reading'],
    expertiseAreas: ['backend'],
    knowledgeGaps: [],
    productRelationship: {
      discoveryStory: 'Test',
      usageDuration: '6 months',
      satisfactionLevel: 8,
      complaints: [],
      useCase: 'Test',
      alternativesConsidered: [],
    },
    opinions: {},
    neverDo: [],
    maturity: 'lurking' as const,
  };
}

describe('Legend Account Routes', () => {
  let app: FastifyInstance;
  let testProductId: string;
  let testLegendId: string;

  beforeAll(async () => {
    app = await buildServer();

    const db = getDb();
    const productSlug = `${CANARY_PRODUCT_PREFIX}${Date.now()}`;
    const [product] = await db
      .insert(products)
      .values({
        name: 'Integration Test Product',
        slug: productSlug,
        description: 'Test',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      })
      .returning();
    if (!product) throw new Error('Failed to create test product');
    testProductId = product.id;

    const [legend] = await db.insert(legends).values(makeLegendInput(testProductId)).returning();
    if (!legend) throw new Error('Failed to create test legend');
    testLegendId = legend.id;
  });

  afterEach(async () => {
    await cleanupAccounts();
  });

  afterAll(async () => {
    await cleanupAccounts();
    await cleanupLegends();
    await cleanupProducts();
    await app.close();
    await closeDb();
  });

  it('should create account via POST /legends/:legendId/accounts', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'twitter',
        username: `${CANARY_HTTP_PREFIX}user1`,
      },
    });
    expect(res.statusCode).toBe(201);
    const data = JSON.parse(res.body);
    expect(data.legendId).toBe(testLegendId);
    expect(data.platform).toBe('twitter');
  });

  it('should return 400 on invalid creation payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'invalid platform!',
        username: `${CANARY_HTTP_PREFIX}user2`,
      },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toBe('ValidationError');
  });

  it('should return 400 on missing legend', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/legends/00000000-0000-0000-0000-000000000000/accounts`,
      payload: {
        platform: 'reddit',
        username: `${CANARY_HTTP_PREFIX}user3`,
      },
    });
    expect(res.statusCode).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toBe('LegendNotFound');
  });

  it('should list accounts for a legend', async () => {
    // Create two accounts
    await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'twitter',
        username: `${CANARY_HTTP_PREFIX}twitter-user`,
      },
    });
    await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'youtube',
        username: `${CANARY_HTTP_PREFIX}youtube-user`,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/legends/${testLegendId}/accounts`,
    });
    expect(res.statusCode).toBe(200);
    const data = JSON.parse(res.body);
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it('should get account by id', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'discord',
        username: `${CANARY_HTTP_PREFIX}discord-user`,
      },
    });
    const created = JSON.parse(createRes.body);

    const getRes = await app.inject({
      method: 'GET',
      url: `/accounts/${created.id}`,
    });
    expect(getRes.statusCode).toBe(200);
    const data = JSON.parse(getRes.body);
    expect(data.id).toBe(created.id);
  });

  it('should return 404 on missing account get', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/accounts/00000000-0000-0000-0000-000000000000',
    });
    expect(res.statusCode).toBe(404);
  });

  it('should patch account', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'twitch',
        username: `${CANARY_HTTP_PREFIX}streamer`,
      },
    });
    const created = JSON.parse(createRes.body);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/accounts/${created.id}`,
      payload: { karma: 1000 },
    });
    expect(patchRes.statusCode).toBe(200);
    const data = JSON.parse(patchRes.body);
    expect(data.karma).toBe(1000);
  });

  it('should delete account', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'mastodon',
        username: `${CANARY_HTTP_PREFIX}fedi`,
      },
    });
    const created = JSON.parse(createRes.body);

    const deleteRes = await app.inject({
      method: 'DELETE',
      url: `/accounts/${created.id}`,
    });
    expect(deleteRes.statusCode).toBe(204);

    const getRes = await app.inject({
      method: 'GET',
      url: `/accounts/${created.id}`,
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('should advance warm-up phase', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'bluesky',
        username: `${CANARY_HTTP_PREFIX}bsky`,
      },
    });
    const created = JSON.parse(createRes.body);
    expect(created.warmUpPhase).toBe('lurking');

    const advanceRes = await app.inject({
      method: 'POST',
      url: `/accounts/${created.id}/warm-up`,
      payload: { toPhase: 'engaging' },
    });
    expect(advanceRes.statusCode).toBe(200);
    const data = JSON.parse(advanceRes.body);
    expect(data.warmUpPhase).toBe('engaging');
  });

  it('should reject illegal warm-up transition', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'threads',
        username: `${CANARY_HTTP_PREFIX}threads`,
      },
    });
    const created = JSON.parse(createRes.body);

    const advanceRes = await app.inject({
      method: 'POST',
      url: `/accounts/${created.id}/warm-up`,
      payload: { toPhase: 'established' },
    });
    expect(advanceRes.statusCode).toBe(409);
  });

  it('should record post', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'tiktok',
        username: `${CANARY_HTTP_PREFIX}tiktok`,
      },
    });
    const created = JSON.parse(createRes.body);
    expect(created.postsToday).toBe(0);

    const postRes = await app.inject({
      method: 'POST',
      url: `/accounts/${created.id}/posts`,
      payload: {},
    });
    expect(postRes.statusCode).toBe(200);
    const data = JSON.parse(postRes.body);
    expect(data.postsToday).toBe(1);
    expect(data.postsThisWeek).toBe(1);
    expect(data.lastPostAt).not.toBeNull();
  });

  it('should record product mention', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/legends/${testLegendId}/accounts`,
      payload: {
        platform: 'instagram',
        username: `${CANARY_HTTP_PREFIX}insta`,
      },
    });
    const created = JSON.parse(createRes.body);

    const postRes = await app.inject({
      method: 'POST',
      url: `/accounts/${created.id}/posts`,
      payload: { isProductMention: true },
    });
    expect(postRes.statusCode).toBe(200);
    const data = JSON.parse(postRes.body);
    expect(data.lastProductMentionAt).not.toBeNull();
  });
});
