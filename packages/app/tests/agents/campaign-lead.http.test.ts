import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/server.js';

describe('CampaignLead HTTP routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /agents/campaign-lead/decide with safetyResult.allowed=false returns 200 with reject decision', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/campaign-lead/decide',
      payload: {
        draftContent: 'sample draft',
        personaSummary: 'Dave, plumber, casual.',
        qualityScore: {
          authenticity: 9,
          value: 8,
          promotionalSmell: 3,
          personaConsistency: 9,
          communityFit: 9,
          comments: 'Looks good.',
        },
        safetyResult: {
          allowed: false,
          reason: 'Daily cap reached',
        },
        promotionLevel: 3,
        campaignGoal: 'Build trust in r/Plumbing',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.decision.decision).toBe('reject');
    expect(body.decision.reasoning).toContain('Daily cap reached');
    expect(body.llm).toBeNull();
  });

  it('POST /agents/campaign-lead/decide with missing draftContent returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/campaign-lead/decide',
      payload: {
        personaSummary: 'Dave',
        qualityScore: {
          authenticity: 9,
          value: 8,
          promotionalSmell: 3,
          personaConsistency: 9,
          communityFit: 9,
          comments: 'Good.',
        },
        safetyResult: {
          allowed: true,
        },
        promotionLevel: 3,
        campaignGoal: 'Build trust',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });

  it('POST /agents/campaign-lead/decide with invalid promotionLevel returns 400', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/campaign-lead/decide',
      payload: {
        draftContent: 'sample draft',
        personaSummary: 'Dave',
        qualityScore: {
          authenticity: 9,
          value: 8,
          promotionalSmell: 3,
          personaConsistency: 9,
          communityFit: 9,
          comments: 'Good.',
        },
        safetyResult: {
          allowed: true,
        },
        promotionLevel: 15,
        campaignGoal: 'Build trust',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });
});
