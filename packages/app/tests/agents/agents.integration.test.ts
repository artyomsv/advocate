import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = 'canary-agent-http-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('/agents/content-writer/draft', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(cleanup);
  afterEach(cleanup);

  async function seed(): Promise<{ legendId: string; productId: string }> {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        name: 'FBS',
        slug: `${PREFIX}product-${Date.now()}`,
        description: 'x',
        status: 'draft',
        valueProps: ['v'],
        painPoints: ['p'],
        talkingPoints: ['t'],
      })
      .returning();
    const productId = product?.id;
    if (!productId) throw new Error('Product creation failed');

    const [legend] = await db
      .insert(legends)
      .values({
        productId,
        firstName: `${PREFIX}Jane`,
        lastName: 'Doe',
        gender: 'female',
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
    return { legendId, productId };
  }

  it('POST /agents/content-writer/draft → 200 with content + llm metadata', async () => {
    const { legendId, productId } = await seed();
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: {
        legendId,
        productId,
        task: {
          type: 'helpful_comment',
          promotionLevel: 0,
          instructions: 'Reply helpfully.',
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      content: string;
      llm: { providerId: string; costMillicents: number };
    }>();
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.llm.providerId).toBeDefined();
    expect(body.llm.costMillicents).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('POST /agents/content-writer/draft → 400 on missing fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: { legendId: 'not-a-uuid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /agents/content-writer/draft → 404 when legend unknown', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: {
        legendId: '00000000-0000-4000-8000-000000000000',
        task: { type: 'helpful_comment', promotionLevel: 0, instructions: 'x' },
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
