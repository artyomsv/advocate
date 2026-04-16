import { like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legendAccounts, legendCredentials, legends, products } from '../../src/db/schema.js';
import { LegendCredentialService } from '../../src/legend-accounts/credential.service.js';
import { CredentialNotFoundError } from '../../src/legend-accounts/errors.js';

const MASTER_KEY = 'a'.repeat(64);
const CANARY_CRED_PREFIX = 'canary-credential-';
const CANARY_PRODUCT_PREFIX = 'canary-credential-parent-';

async function cleanupCredentials(): Promise<void> {
  const db = getDb();
  await db.delete(legendCredentials);
}

async function cleanupAccounts(): Promise<void> {
  const db = getDb();
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${CANARY_CRED_PREFIX}%`));
}

async function cleanupLegends(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${CANARY_CRED_PREFIX}%`));
}

async function cleanupProducts(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${CANARY_PRODUCT_PREFIX}%`));
}

function makeLegendInput(productId: string) {
  return {
    productId,
    firstName: `${CANARY_CRED_PREFIX}legend`,
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

describe('LegendCredentialService', () => {
  const service = new LegendCredentialService(getDb(), MASTER_KEY);
  let testProductId: string;
  let testLegendId: string;
  let testAccountId: string;

  beforeAll(async () => {
    const db = getDb();
    const productSlug = `${CANARY_PRODUCT_PREFIX}${Date.now()}`;
    const [product] = await db
      .insert(products)
      .values({
        name: 'Credential Test Product',
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

    const [account] = await db
      .insert(legendAccounts)
      .values({
        legendId: testLegendId,
        platform: 'test-platform',
        username: `${CANARY_CRED_PREFIX}account`,
      })
      .returning();
    if (!account) throw new Error('Failed to create test account');
    testAccountId = account.id;
  });

  afterEach(async () => {
    await cleanupCredentials();
  });

  afterAll(async () => {
    await cleanupCredentials();
    await cleanupAccounts();
    await cleanupLegends();
    await cleanupProducts();
    await closeDb();
  });

  it('should store credential encrypted', async () => {
    const plaintext = 'super-secret-oauth-token-12345';
    const credential = await service.store({
      legendAccountId: testAccountId,
      type: 'oauth_token',
      plaintext,
    });

    expect(credential.id).toBeDefined();
    expect(credential.encryptedPayload).toBeDefined();
    expect(credential.encryptedPayload).not.toBe(plaintext);
    expect(credential.revoked).toBe(false);
  });

  it('should list credentials without plaintext', async () => {
    const plaintext = 'secret-api-key';
    await service.store({
      legendAccountId: testAccountId,
      type: 'api_key',
      plaintext,
      metadata: { provider: 'twitter' },
    });

    const list = await service.listForAccount(testAccountId);
    expect(list.length).toBeGreaterThanOrEqual(1);
    const cred = list[0];
    expect(cred.id).toBeDefined();
    expect(cred.type).toBe('api_key');
    expect(cred.metadata?.provider).toBe('twitter');
    expect(cred.revoked).toBe(false);
    expect('encryptedPayload' in cred).toBe(false);
  });

  it('should reveal plaintext for credential', async () => {
    const plaintext = 'my-oauth-secret-xyz';
    const credential = await service.store({
      legendAccountId: testAccountId,
      type: 'oauth_token',
      plaintext,
    });

    const revealed = await service.reveal(credential.id);
    expect(revealed).toBe(plaintext);
  });

  it('should throw CredentialNotFoundError on reveal missing', async () => {
    await expect(service.reveal('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      CredentialNotFoundError,
    );
  });

  it('should rotate credential', async () => {
    const oldPlaintext = 'old-token-abc';
    const newPlaintext = 'new-token-xyz';

    const oldCred = await service.store({
      legendAccountId: testAccountId,
      type: 'refresh_token',
      plaintext: oldPlaintext,
    });

    const newCred = await service.rotate(oldCred.id, newPlaintext);

    expect(newCred.id).not.toBe(oldCred.id);
    expect(newCred.legendAccountId).toBe(oldCred.legendAccountId);
    expect(newCred.type).toBe(oldCred.type);
    expect(newCred.revoked).toBe(false);

    const revealed = await service.reveal(newCred.id);
    expect(revealed).toBe(newPlaintext);

    const oldRevealed = await service.reveal(oldCred.id);
    expect(oldRevealed).toBe(oldPlaintext);

    const list = await service.listForAccount(testAccountId);
    const revokedOld = list.find((c) => c.id === oldCred.id);
    expect(revokedOld?.revoked).toBe(true);
  });

  it('should revoke credential', async () => {
    const credential = await service.store({
      legendAccountId: testAccountId,
      type: 'api_key',
      plaintext: 'api-secret',
    });

    await service.revoke(credential.id);

    const list = await service.listForAccount(testAccountId);
    const revoked = list.find((c) => c.id === credential.id);
    expect(revoked?.revoked).toBe(true);
  });

  it('should throw CredentialNotFoundError on revoke missing', async () => {
    await expect(service.revoke('00000000-0000-0000-0000-000000000000')).rejects.toBeInstanceOf(
      CredentialNotFoundError,
    );
  });

  it('should preserve metadata through rotation', async () => {
    const metadata = { provider: 'github', scope: 'repo' };
    const oldCred = await service.store({
      legendAccountId: testAccountId,
      type: 'oauth_token',
      plaintext: 'old-gh-token',
      metadata,
    });

    const newCred = await service.rotate(oldCred.id, 'new-gh-token');
    expect(newCred.metadata).toEqual(metadata);
  });
});
