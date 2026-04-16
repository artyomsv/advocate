import { like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import {
  LegendNotFoundError,
  LegendProductNotFoundError,
  LegendValidationError,
} from '../../src/legends/errors.js';
import { LegendService } from '../../src/legends/legend.service.js';

const PREFIX = 'canary-svc-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `canary-svc-product%`));
}

function makeLegendInput(productId: string, firstName = 'canary-svc-test') {
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

describe('LegendService', () => {
  const service = new LegendService(getDb());
  let testProductId: string;
  let testProductSlug: string;

  beforeEach(async () => {
    await cleanup();
    const db = getDb();
    testProductSlug = `canary-svc-product-${Date.now()}`;
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
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('create stores and returns a valid legend', async () => {
    const legend = await service.create(makeLegendInput(testProductId, `${PREFIX}create`));
    expect(legend.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(legend.firstName).toBe(`${PREFIX}create`);
    expect(legend.productId).toBe(testProductId);
    expect(legend.maturity).toBe('engaging');
  });

  it('create throws LegendValidationError on invalid input', async () => {
    await expect(
      service.create({
        productId: testProductId,
        firstName: '',
        lastName: 'Tester',
        // missing required fields
      }),
    ).rejects.toBeInstanceOf(LegendValidationError);
  });

  it('create throws LegendProductNotFoundError when productId does not exist', async () => {
    const input = makeLegendInput('00000000-0000-4000-8000-000000000000', `${PREFIX}fk`);
    await expect(service.create(input)).rejects.toBeInstanceOf(LegendProductNotFoundError);
  });

  it('get throws LegendNotFoundError when id is unknown', async () => {
    await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      LegendNotFoundError,
    );
  });

  it('get returns legend when id exists', async () => {
    const created = await service.create(makeLegendInput(testProductId, `${PREFIX}get`));
    const fetched = await service.get(created.id);
    expect(fetched.id).toBe(created.id);
    expect(fetched.firstName).toBe(`${PREFIX}get`);
  });

  it('update validates patch + returns updated row', async () => {
    const created = await service.create(makeLegendInput(testProductId, `${PREFIX}upd`));
    const updated = await service.update(created.id, { firstName: 'Renamed' });
    expect(updated.firstName).toBe('Renamed');
    expect(updated.lastName).toBe('Tester');
  });

  it('update throws LegendNotFoundError on missing id', async () => {
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { firstName: 'X' }),
    ).rejects.toBeInstanceOf(LegendNotFoundError);
  });

  it('list returns all legends when no filter', async () => {
    await service.create(makeLegendInput(testProductId, `${PREFIX}list-a`));
    await service.create(makeLegendInput(testProductId, `${PREFIX}list-b`));
    const all = await service.list();
    const canaries = all.filter((l) => l.firstName.startsWith(PREFIX));
    expect(canaries.length).toBeGreaterThanOrEqual(2);
  });

  it('listForProduct returns only legends for that product', async () => {
    const created = await service.create(makeLegendInput(testProductId, `${PREFIX}lprod`));
    const filtered = await service.listForProduct(testProductId);
    const match = filtered.find((l) => l.id === created.id);
    expect(match).toBeDefined();
    expect(match?.firstName).toBe(`${PREFIX}lprod`);
  });

  it('remove returns void on success, throws on missing id', async () => {
    const created = await service.create(makeLegendInput(testProductId, `${PREFIX}rm`));
    await service.remove(created.id);
    await expect(service.remove(created.id)).rejects.toBeInstanceOf(LegendNotFoundError);
  });
});
