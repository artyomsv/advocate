import { like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../src/products/errors.js';
import { ProductService } from '../../src/products/product.service.js';

const PREFIX = 'canary-svc-';

async function cleanup(): Promise<void> {
  await getDb().delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('ProductService', () => {
  const service = new ProductService(getDb());

  beforeEach(cleanup);
  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('create stores and returns a valid product', async () => {
    const product = await service.create({
      name: 'Fairy Book Store',
      slug: `${PREFIX}create`,
      description: 'Children\'s books',
      valueProps: ['personalized'],
      painPoints: ['generic'],
      talkingPoints: ['custom'],
    });
    expect(product.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(product.slug).toBe(`${PREFIX}create`);
    expect(product.status).toBe('draft');
  });

  it('create throws ProductValidationError on invalid slug', async () => {
    await expect(
      service.create({
        name: 'X',
        slug: 'Bad Slug!', // spaces + uppercase + punctuation
        description: 'x',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toBeInstanceOf(ProductValidationError);
  });

  it('create throws DuplicateSlugError on existing slug', async () => {
    await service.create({
      name: 'A',
      slug: `${PREFIX}dup`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await expect(
      service.create({
        name: 'B',
        slug: `${PREFIX}dup`,
        description: 'b',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toBeInstanceOf(DuplicateSlugError);
  });

  it('get throws ProductNotFoundError when id is unknown', async () => {
    await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it('update validates patch + returns updated row', async () => {
    const created = await service.create({
      name: 'A',
      slug: `${PREFIX}upd`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const updated = await service.update(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('update throws ProductNotFoundError on missing id', async () => {
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { name: 'X' }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('remove returns void on success, throws on missing id', async () => {
    const created = await service.create({
      name: 'A',
      slug: `${PREFIX}rm`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await service.remove(created.id);
    await expect(service.remove(created.id)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
