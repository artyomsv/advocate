import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = 'canary-http-';

async function cleanup(): Promise<void> {
  await getDb()
    .delete(products)
    .where(like(products.slug, `${PREFIX}%`));
}

describe('/products routes', () => {
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

  it('POST /products → 201 with created row', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'Fairy Book Store',
        slug: `${PREFIX}create`,
        description: "Children's books",
        valueProps: ['personalized'],
        painPoints: ['generic books'],
        talkingPoints: ['custom characters'],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; slug: string }>();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.slug).toBe(`${PREFIX}create`);
  });

  it('POST /products → 400 on invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: '' }, // missing required fields
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /products → 409 on duplicate slug', async () => {
    const body = {
      name: 'A',
      slug: `${PREFIX}dup`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    };
    await app.inject({ method: 'POST', url: '/products', payload: body });
    const second = await app.inject({ method: 'POST', url: '/products', payload: body });
    expect(second.statusCode).toBe(409);
  });

  it('GET /products → 200 with array', async () => {
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}list`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const response = await app.inject({ method: 'GET', url: '/products' });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ slug: string }[]>();
    expect(rows.some((r) => r.slug === `${PREFIX}list`)).toBe(true);
  });

  it('GET /products/:id → 200 with row, 404 when missing', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}get`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const found = await app.inject({ method: 'GET', url: `/products/${id}` });
    expect(found.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'GET',
      url: '/products/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('PATCH /products/:id → 200 with updated row', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}patch`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/products/${id}`,
      payload: { name: 'Renamed' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ name: string }>().name).toBe('Renamed');
  });

  it('DELETE /products/:id → 204; repeat → 404', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}del`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const first = await app.inject({ method: 'DELETE', url: `/products/${id}` });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: `/products/${id}` });
    expect(second.statusCode).toBe(404);
  });
});
