import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { platformSecrets } from '../../src/db/schema.js';
import { SecretsService } from '../../src/secrets/secrets.service.js';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(platformSecrets).where(eq(platformSecrets.category, 'reddit'));
  await db.delete(platformSecrets).where(eq(platformSecrets.category, 'llm'));
  await db.delete(platformSecrets).where(eq(platformSecrets.category, 'telegram'));
}

describe('SecretsService', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('set then resolve round-trips plaintext', async () => {
    const svc = new SecretsService(getDb());
    await svc.set('reddit', 'REDDIT_CLIENT_ID', 'abc123');
    const got = await svc.resolve('reddit', 'REDDIT_CLIENT_ID');
    expect(got).toBe('abc123');
  });

  it('list masks the stored value and marks source=db', async () => {
    const svc = new SecretsService(getDb());
    await svc.set('reddit', 'REDDIT_CLIENT_SECRET', 'very-secret-abc');
    const list = await svc.list('reddit');
    const row = list.find((r) => r.key === 'REDDIT_CLIENT_SECRET');
    expect(row?.masked).toBe('••••••••bc');
    expect(row?.source).toBe('db');
  });

  it('list reports source=env when no DB row and env var is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'env-value-01';
    const svc = new SecretsService(getDb());
    const list = await svc.list('llm');
    const row = list.find((r) => r.key === 'ANTHROPIC_API_KEY');
    expect(row?.source).toBe('env');
    expect(row?.masked).toBe('••••••••01');
  });

  it('delete falls back to env value on next resolve', async () => {
    process.env.ANTHROPIC_API_KEY = 'from-env-xx';
    const svc = new SecretsService(getDb());
    await svc.set('llm', 'ANTHROPIC_API_KEY', 'from-db-yy');
    expect(await svc.resolve('llm', 'ANTHROPIC_API_KEY')).toBe('from-db-yy');
    await svc.delete('llm', 'ANTHROPIC_API_KEY');
    expect(await svc.resolve('llm', 'ANTHROPIC_API_KEY')).toBe('from-env-xx');
  });

  it('rejects unknown key', async () => {
    const svc = new SecretsService(getDb());
    await expect(svc.set('reddit', 'BOGUS_KEY', 'x')).rejects.toThrow(/Unknown secret key/);
  });
});
