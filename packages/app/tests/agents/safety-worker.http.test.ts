import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legendAccounts, legends, products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = 'canary-safety-http-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

async function setupAccount(): Promise<string> {
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
      status: 'active',
    })
    .returning();
  const accountId = account?.id;
  if (!accountId) throw new Error('Account creation failed');

  return accountId;
}

describe('POST /agents/safety-worker/check', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    await closeDb();
  });

  beforeEach(cleanup);
  afterEach(cleanup);

  it('returns 200 with allowed=true when account is fresh', async () => {
    const accountId = await setupAccount();
    const response = await app.inject({
      method: 'POST',
      url: '/agents/safety-worker/check',
      payload: {
        legendAccountId: accountId,
        promotionLevel: 0,
      },
    });
    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.allowed).toBe(true);
  });

  it('returns 400 on invalid UUID format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/safety-worker/check',
      payload: {
        legendAccountId: 'not-a-uuid',
        promotionLevel: 0,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });

  it('returns 404 when account does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/safety-worker/check',
      payload: {
        legendAccountId: '00000000-0000-4000-8000-000000000000',
        promotionLevel: 0,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('NotFound');
  });

  it('returns 400 on missing promotionLevel', async () => {
    const accountId = await setupAccount();
    const response = await app.inject({
      method: 'POST',
      url: '/agents/safety-worker/check',
      payload: {
        legendAccountId: accountId,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });
});
