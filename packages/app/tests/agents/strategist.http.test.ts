import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/server.js';

describe('Strategist HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /agents/strategist/plan with missing availableLegends returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/strategist/plan',
      payload: {
        productName: 'Foreman',
        productOneLiner: 'AI phone answering',
        campaignGoal: 'Build trust',
        availableLegends: [],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r/Plumbing',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });

  it('POST /agents/strategist/plan with missing productName returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/strategist/plan',
      payload: {
        productOneLiner: 'AI phone answering',
        campaignGoal: 'Build trust',
        availableLegends: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            summary: 'Dave',
            maturity: 'lurking',
          },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r/Plumbing',
          },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });
});
