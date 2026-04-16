import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/server.js';

describe('POST /agents/quality-gate/review', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 400 on missing required field', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/quality-gate/review',
      payload: {
        draftContent: 'test',
        personaSummary: 'Dave',
        // missing communityRules and promotionLevel
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });

  it('returns 400 on invalid promotionLevel (out of range)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/quality-gate/review',
      payload: {
        draftContent: 'test',
        personaSummary: 'Dave',
        communityRules: 'rules',
        promotionLevel: 15, // max is 10
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });

  it('returns 400 on empty draftContent', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/quality-gate/review',
      payload: {
        draftContent: '',
        personaSummary: 'Dave',
        communityRules: 'rules',
        promotionLevel: 0,
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe('ValidationError');
  });
});
