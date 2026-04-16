import { like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legendAccounts, legends, products } from '../../src/db/schema.js';
import { LegendAccountRepository } from '../../src/legend-accounts/account.repository.js';

const CANARY_ACCOUNT_PREFIX = 'canary-account-repo-';
const CANARY_PRODUCT_PREFIX = 'canary-account-repo-parent-';

async function cleanupAccounts(): Promise<void> {
  const db = getDb();
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${CANARY_ACCOUNT_PREFIX}%`));
}

async function cleanupLegends(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${CANARY_ACCOUNT_PREFIX}%`));
}

async function cleanupProducts(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${CANARY_PRODUCT_PREFIX}%`));
}

function makeLegendInput(productId: string) {
  return {
    productId,
    firstName: `${CANARY_ACCOUNT_PREFIX}legend`,
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

describe('LegendAccountRepository', () => {
  const repo = new LegendAccountRepository(getDb());
  let testProductId: string;
  let testProductSlug: string;
  let testLegendId: string;

  beforeAll(async () => {
    // Create parent product
    const db = getDb();
    testProductSlug = `${CANARY_PRODUCT_PREFIX}${Date.now()}`;
    const [product] = await db
      .insert(products)
      .values({
        name: 'Account Test Product',
        slug: testProductSlug,
        description: 'Test',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      })
      .returning();
    if (!product) throw new Error('Failed to create test product');
    testProductId = product.id;

    // Create parent legend
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
    await closeDb();
  });

  it('should create and return account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'twitter',
      username: `${CANARY_ACCOUNT_PREFIX}user1`,
    };
    const account = await repo.create(input);
    expect(account).toBeDefined();
    expect(account.legendId).toBe(testLegendId);
    expect(account.platform).toBe('twitter');
    expect(account.username).toBe(input.username);
  });

  it('should find account by id', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'reddit',
      username: `${CANARY_ACCOUNT_PREFIX}redditor`,
    };
    const created = await repo.create(input);
    const found = await repo.findById(created.id);
    expect(found).toEqual(created);
  });

  it('should return null for missing id', async () => {
    const found = await repo.findById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('should find by legend and platform', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'discord',
      username: `${CANARY_ACCOUNT_PREFIX}discord-user`,
    };
    const created = await repo.create(input);
    const found = await repo.findByLegendAndPlatform(testLegendId, 'discord');
    expect(found).toEqual(created);
  });

  it('should return null if legend+platform not found', async () => {
    const found = await repo.findByLegendAndPlatform(testLegendId, 'nonexistent-platform');
    expect(found).toBeNull();
  });

  it('should list accounts by legend id', async () => {
    const input1 = {
      legendId: testLegendId,
      platform: 'twitter',
      username: `${CANARY_ACCOUNT_PREFIX}twitter-1`,
    };
    const input2 = {
      legendId: testLegendId,
      platform: 'youtube',
      username: `${CANARY_ACCOUNT_PREFIX}youtube-1`,
    };
    await repo.create(input1);
    await repo.create(input2);

    const list = await repo.list({ legendId: testLegendId });
    expect(list.length).toBe(2);
    expect(list.map((a) => a.platform).sort()).toEqual(['twitter', 'youtube']);
  });

  it('should list all accounts unfiltered', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'twitch',
      username: `${CANARY_ACCOUNT_PREFIX}streamer`,
    };
    await repo.create(input);
    const list = await repo.list();
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list.some((a) => a.username === input.username)).toBe(true);
  });

  it('should update account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'mastodon',
      username: `${CANARY_ACCOUNT_PREFIX}fediverse`,
    };
    const created = await repo.create(input);
    const updated = await repo.update(created.id, { karma: 500 });
    expect(updated).toBeDefined();
    expect(updated?.karma).toBe(500);
    expect(updated?.username).toBe(input.username);
  });

  it('should return null if update target missing', async () => {
    const updated = await repo.update('00000000-0000-0000-0000-000000000000', { karma: 100 });
    expect(updated).toBeNull();
  });

  it('should remove account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'bluesky',
      username: `${CANARY_ACCOUNT_PREFIX}bluesky-user`,
    };
    const created = await repo.create(input);
    const removed = await repo.remove(created.id);
    expect(removed).toBe(true);

    const found = await repo.findById(created.id);
    expect(found).toBeNull();
  });

  it('should return false if remove target missing', async () => {
    const removed = await repo.remove('00000000-0000-0000-0000-000000000000');
    expect(removed).toBe(false);
  });
});
