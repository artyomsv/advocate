import { like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legendAccounts, legends, products } from '../../src/db/schema.js';
import { LegendAccountService } from '../../src/legend-accounts/account.service.js';
import {
  IllegalWarmUpTransitionError,
  LegendAccountLegendNotFoundError,
  LegendAccountNotFoundError,
  LegendAccountValidationError,
} from '../../src/legend-accounts/errors.js';

const CANARY_SVC_PREFIX = 'canary-account-svc-';
const CANARY_PRODUCT_PREFIX = 'canary-account-svc-parent-';

async function cleanupAccounts(): Promise<void> {
  const db = getDb();
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${CANARY_SVC_PREFIX}%`));
}

async function cleanupLegends(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${CANARY_SVC_PREFIX}%`));
}

async function cleanupProducts(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${CANARY_PRODUCT_PREFIX}%`));
}

function makeLegendInput(productId: string) {
  return {
    productId,
    firstName: `${CANARY_SVC_PREFIX}legend`,
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

describe('LegendAccountService', () => {
  const service = new LegendAccountService(getDb());
  let testProductId: string;
  let testLegendId: string;

  beforeAll(async () => {
    const db = getDb();
    const productSlug = `${CANARY_PRODUCT_PREFIX}${Date.now()}`;
    const [product] = await db
      .insert(products)
      .values({
        name: 'Service Test Product',
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
    await closeDb();
  });

  it('should create valid account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'twitter',
      username: `${CANARY_SVC_PREFIX}user1`,
    };
    const account = await service.create(input);
    expect(account.legendId).toBe(testLegendId);
    expect(account.username).toBe(input.username);
  });

  it('should throw ValidationError on bad input', async () => {
    const input = {
      legendId: 'not-a-uuid',
      platform: 'twitter',
      username: `${CANARY_SVC_PREFIX}user`,
    };
    await expect(service.create(input)).rejects.toBeInstanceOf(LegendAccountValidationError);
  });

  it('should throw LegendNotFoundError on invalid legendId', async () => {
    const input = {
      legendId: '00000000-0000-0000-0000-000000000000',
      platform: 'twitter',
      username: `${CANARY_SVC_PREFIX}user2`,
    };
    await expect(service.create(input)).rejects.toBeInstanceOf(LegendAccountLegendNotFoundError);
  });

  it('should throw NotFoundError on missing account', async () => {
    await expect(service.get('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      LegendAccountNotFoundError,
    );
  });

  it('should get existing account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'reddit',
      username: `${CANARY_SVC_PREFIX}redditor`,
    };
    const created = await service.create(input);
    const found = await service.get(created.id);
    expect(found.id).toBe(created.id);
  });

  it('should update account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'discord',
      username: `${CANARY_SVC_PREFIX}discord-user`,
    };
    const created = await service.create(input);
    const updated = await service.update(created.id, { karma: 1000 });
    expect(updated.karma).toBe(1000);
  });

  it('should throw NotFoundError on update missing', async () => {
    await expect(
      service.update('00000000-0000-0000-0000-000000000000', { karma: 500 }),
    ).rejects.toBeInstanceOf(LegendAccountNotFoundError);
  });

  it('should remove account', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'twitch',
      username: `${CANARY_SVC_PREFIX}streamer`,
    };
    const created = await service.create(input);
    await service.remove(created.id);
    await expect(service.get(created.id)).rejects.toBeInstanceOf(LegendAccountNotFoundError);
  });

  it('should throw NotFoundError on remove missing', async () => {
    await expect(service.remove('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      LegendAccountNotFoundError,
    );
  });

  it('should advance warm-up lurking -> engaging', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'youtube',
      username: `${CANARY_SVC_PREFIX}youtube1`,
    };
    const created = await service.create(input);
    const advanced = await service.advanceWarmUp(created.id, 'engaging');
    expect(advanced.warmUpPhase).toBe('engaging');
    expect(advanced.warmUpCompletedAt).toBeNull();
  });

  it('should reject backward warm-up transition', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'mastodon',
      username: `${CANARY_SVC_PREFIX}fedi`,
      warmUpPhase: 'engaging',
    };
    const created = await service.create(input);
    await expect(service.advanceWarmUp(created.id, 'lurking')).rejects.toBeInstanceOf(
      IllegalWarmUpTransitionError,
    );
  });

  it('should reject skip-ahead warm-up transition', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'bluesky',
      username: `${CANARY_SVC_PREFIX}bsky`,
      warmUpPhase: 'lurking',
    };
    const created = await service.create(input);
    await expect(service.advanceWarmUp(created.id, 'established')).rejects.toBeInstanceOf(
      IllegalWarmUpTransitionError,
    );
  });

  it('should allow same-phase warm-up transition (idempotent)', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'nostr',
      username: `${CANARY_SVC_PREFIX}nostr`,
      warmUpPhase: 'engaging',
    };
    const created = await service.create(input);
    const same = await service.advanceWarmUp(created.id, 'engaging');
    expect(same.warmUpPhase).toBe('engaging');
  });

  it('should stamp warmUpCompletedAt when reaching promoting', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'threads',
      username: `${CANARY_SVC_PREFIX}threads`,
      warmUpPhase: 'established',
    };
    const created = await service.create(input);
    const promoted = await service.advanceWarmUp(created.id, 'promoting');
    expect(promoted.warmUpPhase).toBe('promoting');
    expect(promoted.warmUpCompletedAt).not.toBeNull();
  });

  it('should record post and increment counters', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'linkedin',
      username: `${CANARY_SVC_PREFIX}linkedin`,
    };
    const created = await service.create(input);
    const recorded = await service.recordPost(created.id);
    expect(recorded.postsToday).toBe(1);
    expect(recorded.postsThisWeek).toBe(1);
    expect(recorded.lastPostAt).not.toBeNull();
  });

  it('should record product mention and stamp lastProductMentionAt', async () => {
    const input = {
      legendId: testLegendId,
      platform: 'tiktok',
      username: `${CANARY_SVC_PREFIX}tiktok`,
    };
    const created = await service.create(input);
    const recorded = await service.recordPost(created.id, { isProductMention: true });
    expect(recorded.postsToday).toBe(1);
    expect(recorded.lastProductMentionAt).not.toBeNull();
  });
});
