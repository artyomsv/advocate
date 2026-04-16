import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import { ProductRepository } from '../../src/products/product.repository.js';

const TEST_SLUG_PREFIX = 'canary-repo-';

async function cleanupCanaries(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${TEST_SLUG_PREFIX}%`));
}

describe('ProductRepository', () => {
  const repo = new ProductRepository(getDb());

  beforeEach(cleanupCanaries);
  afterEach(cleanupCanaries);
  afterAll(async () => {
    await cleanupCanaries();
    await closeDb();
  });

  it('create inserts a row and returns it with id + timestamps', async () => {
    const row = await repo.create({
      name: 'Fairy Book Store',
      slug: `${TEST_SLUG_PREFIX}create`,
      description: "Personalized children's books",
      status: 'draft',
      valueProps: ['personalized'],
      painPoints: ['generic books'],
      talkingPoints: ['your child as the hero'],
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.slug).toBe(`${TEST_SLUG_PREFIX}create`);
    expect(row.valueProps).toEqual(['personalized']);
  });

  it('findById returns null for missing id', async () => {
    const row = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(row).toBeNull();
  });

  it('findBySlug returns the row when present', async () => {
    await repo.create({
      name: 'X',
      slug: `${TEST_SLUG_PREFIX}find`,
      description: 'x',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const found = await repo.findBySlug(`${TEST_SLUG_PREFIX}find`);
    expect(found?.name).toBe('X');
  });

  it('list returns only rows with the canary prefix (when filtered)', async () => {
    await repo.create({
      name: 'A',
      slug: `${TEST_SLUG_PREFIX}list-a`,
      description: 'a',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await repo.create({
      name: 'B',
      slug: `${TEST_SLUG_PREFIX}list-b`,
      description: 'b',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const all = await repo.list();
    const canaries = all.filter((p) => p.slug.startsWith(TEST_SLUG_PREFIX));
    expect(canaries).toHaveLength(2);
  });

  it('update patches only provided fields and bumps updatedAt', async () => {
    const created = await repo.create({
      name: 'Orig',
      slug: `${TEST_SLUG_PREFIX}update`,
      description: 'orig',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await new Promise((r) => setTimeout(r, 10));
    const updated = await repo.update(created.id, { name: 'Renamed' });
    expect(updated?.name).toBe('Renamed');
    expect(updated?.description).toBe('orig');
    expect(updated && updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('update returns null for missing id', async () => {
    const result = await repo.update('00000000-0000-4000-8000-000000000000', { name: 'X' });
    expect(result).toBeNull();
  });

  it('remove deletes the row and returns true; repeat returns false', async () => {
    const created = await repo.create({
      name: 'Del',
      slug: `${TEST_SLUG_PREFIX}remove`,
      description: 'd',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    expect(await repo.remove(created.id)).toBe(true);
    expect(await repo.remove(created.id)).toBe(false);
  });

  it('unique slug constraint surfaces as a Postgres error the caller can catch', async () => {
    const slug = `${TEST_SLUG_PREFIX}dup`;
    await repo.create({
      name: 'A',
      slug,
      description: 'a',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await expect(
      repo.create({
        name: 'B',
        slug,
        description: 'b',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toThrow();
  });
});
