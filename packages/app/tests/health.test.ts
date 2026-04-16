import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server/server.js';

describe('health endpoint', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status ok', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; checks: Record<string, boolean> }>();
    expect(body.status).toBe('ok');
    expect(body.checks.database).toBe(true);
    expect(body.checks.redis).toBe(true);
  });
});
