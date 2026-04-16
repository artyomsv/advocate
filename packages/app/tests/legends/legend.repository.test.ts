import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import { LegendRepository } from '../../src/legends/legend.repository.js';

const TEST_LEGEND_PREFIX = 'canary-legend-';

async function cleanupLegends(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${TEST_LEGEND_PREFIX}%`));
}

async function cleanupProductsByPrefix(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, 'canary-legend-repo%'));
}

function makeLegendInput(productId: string, firstName = 'canary-legend-test') {
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

describe('LegendRepository', () => {
  const repo = new LegendRepository(getDb());
  let testProductId: string;
  let testProductSlug: string;

  beforeEach(async () => {
    await cleanupLegends();
    await cleanupProductsByPrefix();
    const db = getDb();
    testProductSlug = `canary-legend-repo-${Date.now()}`;
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

  afterEach(cleanupLegends);
  afterAll(async () => {
    await cleanupLegends();
    await cleanupProductsByPrefix();
    await closeDb();
  });

  it('create inserts a row and returns it with id + timestamps', async () => {
    const input = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}create`);
    const row = await repo.create(input);
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.firstName).toBe(`${TEST_LEGEND_PREFIX}create`);
    expect(row.productId).toBe(testProductId);
  });

  it('findById returns null for missing id', async () => {
    const row = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(row).toBeNull();
  });

  it('list returns all legends when no filter provided', async () => {
    const input1 = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}list-a`);
    const input2 = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}list-b`);
    await repo.create(input1);
    await repo.create(input2);

    const all = await repo.list();
    const canaries = all.filter((l) => l.firstName.startsWith(TEST_LEGEND_PREFIX));
    expect(canaries.length).toBeGreaterThanOrEqual(2);
  });

  it('list filters by productId when provided', async () => {
    const input1 = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}filter-a`);
    await repo.create(input1);

    // Create a second product and legend
    const db = getDb();
    const [product2] = await db
      .insert(products)
      .values({
        name: 'Test Product 2',
        slug: `canary-legend-repo-2-${Date.now()}`,
        description: 'Test 2',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      })
      .returning({ id: products.id });
    if (!product2) throw new Error('Failed to create second product');

    const input2 = makeLegendInput(product2.id, `${TEST_LEGEND_PREFIX}filter-b`);
    await repo.create(input2);

    const filtered = await repo.list({ productId: testProductId });
    const matchesFilter = filtered.filter((l) => l.firstName.startsWith(TEST_LEGEND_PREFIX));
    expect(matchesFilter.every((l) => l.productId === testProductId)).toBe(true);
    expect(matchesFilter.some((l) => l.firstName === `${TEST_LEGEND_PREFIX}filter-a`)).toBe(true);

    // Cleanup second product
    await db.delete(products).where(eq(products.id, product2.id));
  });

  it('update patches only provided fields and bumps updatedAt', async () => {
    const input = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}update`);
    const created = await repo.create(input);
    await new Promise((r) => setTimeout(r, 10));
    const updated = await repo.update(created.id, { firstName: 'Renamed' });
    expect(updated?.firstName).toBe('Renamed');
    expect(updated?.lastName).toBe('Tester');
    expect(updated && updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('update returns null for missing id', async () => {
    const result = await repo.update('00000000-0000-4000-8000-000000000000', { firstName: 'X' });
    expect(result).toBeNull();
  });

  it('remove deletes the row and returns true; repeat returns false', async () => {
    const input = makeLegendInput(testProductId, `${TEST_LEGEND_PREFIX}remove`);
    const created = await repo.create(input);
    expect(await repo.remove(created.id)).toBe(true);
    expect(await repo.remove(created.id)).toBe(false);
  });
});
