import { like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = `canary-orch-http-${Date.now()}-`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('POST /orchestrate/draft', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    await cleanup();
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
    await cleanup();
    await closeDb();
  });

  beforeEach(cleanup);

  it('returns 400 for invalid productId UUID', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orchestrate/draft',
      payload: {
        productId: 'not-a-uuid',
        campaignGoal: 'Test goal',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });

  it('returns 400 for missing campaignGoal', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orchestrate/draft',
      payload: {
        productId: '00000000-0000-0000-0000-000000000000',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });

  it('returns 404 for product not found', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/orchestrate/draft',
      payload: {
        productId: '00000000-0000-0000-0000-000000000000',
        campaignGoal: 'Test goal',
      },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe('NotFound');
  });

  it('returns 422 for product with no legends', async () => {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        name: 'Empty Product',
        slug: `${PREFIX}empty`,
        description: 'No legends',
        status: 'active',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      })
      .returning();

    const response = await app.inject({
      method: 'POST',
      url: '/orchestrate/draft',
      payload: {
        productId: product!.id,
        campaignGoal: 'Test goal',
      },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error).toBe('UnprocessableEntity');
  });
});
