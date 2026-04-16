import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = 'canary-legend-http-';
const PARENT_SLUG_PREFIX = 'canary-legend-parent-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PARENT_SLUG_PREFIX}%`));
}

function makeLegendInput(productId: string, firstName = 'canary-http-test') {
  return {
    productId,
    firstName,
    lastName: 'Tester',
    gender: 'male' as const,
    age: 35,
    location: {
      city: 'San Francisco',
      state: 'CA',
      country: 'USA',
      timezone: 'America/Los_Angeles',
    },
    lifeDetails: {
      maritalStatus: 'single' as const,
    },
    professional: {
      occupation: 'Engineer',
      company: 'Tech Corp',
      industry: 'Software',
      yearsExperience: 5,
      education: 'BS Computer Science',
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
    activeHours: {
      start: 9,
      end: 17,
    },
    activeDays: [1, 2, 3, 4, 5],
    averagePostLength: 'medium' as const,
    hobbies: ['coding', 'reading'],
    expertiseAreas: ['backend', 'databases'],
    knowledgeGaps: ['frontend'],
    productRelationship: {
      discoveryStory: 'Found it on Product Hunt',
      usageDuration: '6 months',
      satisfactionLevel: 8,
      complaints: [],
      useCase: 'Daily development',
      alternativesConsidered: ['Competitor A'],
    },
    opinions: { reliability: 'excellent' },
    neverDo: ['never spam'],
    maturity: 'engaging' as const,
  };
}

describe('/legends routes', () => {
  let app: FastifyInstance;
  let testProductId: string;
  let testProductSlug: string;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(async () => {
    await cleanup();
    const db = getDb();
    testProductSlug = `${PARENT_SLUG_PREFIX}${Date.now()}`;
    const [product] = await db
      .insert(products)
      .values({
        name: 'Test Product',
        slug: testProductSlug,
        description: 'Test',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      })
      .returning({ id: products.id });
    if (!product) throw new Error('Failed to create test product');
    testProductId = product.id;
  });

  afterEach(cleanup);

  it('POST /legends → 201 with created row', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}create`),
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; firstName: string }>();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.firstName).toBe(`${PREFIX}create`);
  });

  it('POST /legends → 400 on invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: { firstName: '' }, // missing required fields
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /legends → 400 when productId does not exist', async () => {
    const input = makeLegendInput('00000000-0000-4000-8000-000000000000', `${PREFIX}fk`);
    const response = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: input,
    });
    expect(response.statusCode).toBe(400);
    const body = response.json<{ error: string }>();
    expect(body.error).toBe('ProductNotFound');
  });

  it('GET /legends → 200 with array', async () => {
    await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}list`),
    });
    const response = await app.inject({ method: 'GET', url: '/legends' });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ firstName: string }[]>();
    expect(rows.some((r) => r.firstName === `${PREFIX}list`)).toBe(true);
  });

  it('GET /legends/:id → 200 with row, 404 when missing', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}get`),
    });
    const id = created.json<{ id: string }>().id;
    const found = await app.inject({ method: 'GET', url: `/legends/${id}` });
    expect(found.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'GET',
      url: '/legends/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('PATCH /legends/:id → 200 with updated row', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}patch`),
    });
    const id = created.json<{ id: string }>().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/legends/${id}`,
      payload: { firstName: 'Renamed' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ firstName: string }>().firstName).toBe('Renamed');
  });

  it('DELETE /legends/:id → 204; repeat → 404', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}del`),
    });
    const id = created.json<{ id: string }>().id;
    const first = await app.inject({ method: 'DELETE', url: `/legends/${id}` });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: `/legends/${id}` });
    expect(second.statusCode).toBe(404);
  });

  it('GET /products/:productId/legends → 200 with legends for that product', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/legends',
      payload: makeLegendInput(testProductId, `${PREFIX}prod`),
    });
    expect(created.statusCode).toBe(201);

    const response = await app.inject({
      method: 'GET',
      url: `/products/${testProductId}/legends`,
    });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ firstName: string; productId: string }[]>();
    expect(rows.some((r) => r.firstName === `${PREFIX}prod` && r.productId === testProductId)).toBe(
      true,
    );
  });
});
