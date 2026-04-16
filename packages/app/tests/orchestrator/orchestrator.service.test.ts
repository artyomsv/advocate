import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@advocate/engine';
import { like } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  communities,
  contentPlans,
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';
import { OrchestratorService } from '../../src/orchestrator/orchestrator.service.js';
import {
  OrchestratorNoAccountError,
  OrchestratorNoCommunitiesError,
  OrchestratorNoLegendsError,
} from '../../src/orchestrator/types.js';

const PREFIX = 'canary-orch-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(contentPlans).where(like(contentPlans.threadUrl, `${PREFIX}%`));
  await db.delete(legendAccounts).where(like(legendAccounts.username, `${PREFIX}%`));
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(communities).where(like(communities.name, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

async function setupContext(): Promise<{
  productId: string;
  legendId: string;
  legendAccountId: string;
  communityId: string;
}> {
  const db = getDb();

  const [product] = await db
    .insert(products)
    .values({
      name: 'AI Caller',
      slug: `${PREFIX}product-${Date.now()}`,
      description: 'Phone answering service',
      status: 'active',
      valueProps: ['24/7', '$99/mo'],
      painPoints: ['missed calls'],
      talkingPoints: ['catches more business'],
    })
    .returning();
  if (!product?.id) throw new Error('Product creation failed');

  const [legend] = await db
    .insert(legends)
    .values({
      productId: product.id,
      firstName: `${PREFIX}Bob`,
      lastName: 'Builder',
      gender: 'male',
      age: 45,
      location: { city: 'Denver', state: 'CO', country: 'USA', timezone: 'America/Denver' },
      lifeDetails: { maritalStatus: 'married', partnerName: 'Sue' },
      professional: {
        occupation: 'Contractor',
        company: 'ABC Construction',
        industry: 'Construction',
        yearsExperience: 20,
        education: 'Trade school',
      },
      bigFive: {
        openness: 5,
        conscientiousness: 8,
        extraversion: 6,
        agreeableness: 7,
        neuroticism: 3,
      },
      techSavviness: 4,
      typingStyle: {
        capitalization: 'normal',
        punctuation: 'minimal',
        commonTypos: [],
        commonPhrases: ['yeah'],
        avoidedPhrases: ['synergy'],
        paragraphStyle: 'short',
        listStyle: 'rarely',
        usesEmojis: false,
        formality: 4,
      },
      activeHours: { start: 7, end: 18 },
      activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'medium',
      hobbies: ['woodworking'],
      expertiseAreas: ['construction', 'project management'],
      knowledgeGaps: ['design'],
      productRelationship: {
        discoveryStory: 'Found it on google',
        usageDuration: '4 months',
        satisfactionLevel: 8,
        complaints: [],
        useCase: 'call forwarding',
        alternativesConsidered: ['OnX'],
      },
      opinions: { 'home improvement': 'important' },
      neverDo: ['oversell'],
      maturity: 'engaging',
    })
    .returning();
  if (!legend?.id) throw new Error('Legend creation failed');

  const [community] = await db
    .insert(communities)
    .values({
      platform: 'reddit',
      identifier: `${PREFIX}contractors_${Date.now()}`,
      name: `${PREFIX}r/Contractors`,
      url: `${PREFIX}https://reddit.com/r/Contractors`,
      cultureSummary: 'Professional contractors sharing tips',
      rulesSummary: 'No spam, genuine advice only',
      status: 'active',
    })
    .returning();
  if (!community?.id) throw new Error('Community creation failed');

  const [account] = await db
    .insert(legendAccounts)
    .values({
      legendId: legend.id,
      platform: 'reddit',
      username: `${PREFIX}bob_builder`,
      warmUpPhase: 'engaging',
      status: 'active',
      postsToday: 0,
      postsThisWeek: 0,
    })
    .returning();
  if (!account?.id) throw new Error('Account creation failed');

  return {
    productId: product.id,
    legendId: legend.id,
    legendAccountId: account.id,
    communityId: community.id,
  };
}

function makeStubRouter(
  responseMode: 'happy' | 'reject' | 'escalate' | 'safety-blocked' = 'happy',
  overrides?: { strategistLegendId?: string; strategistCommunityId?: string },
) {
  const provider = new StubLLMProvider({ providerId: 'test-stub', defaultModel: 'test-1' });

  // Set default stub responses
  provider.setDefaultStub({
    content: 'default',
    usage: { inputTokens: 100, outputTokens: 50 },
    costMillicents: 10,
    latencyMs: 20,
  });

  // Wrap generate to return different responses based on system prompt
  const origGenerate = provider.generate.bind(provider);
  provider.generate = async (model, req) => {
    const systemPrompt = req.systemPrompt;
    const result = await origGenerate(model, req);

    if (systemPrompt.includes('You are a strategist')) {
      // Strategist response
      return {
        ...result,
        content: JSON.stringify({
          legendId: overrides?.strategistLegendId || '550e8400-e29b-41d4-a716-446655440000',
          communityId: overrides?.strategistCommunityId || '550e8400-e29b-41d4-a716-446655440001',
          contentType: 'helpful_comment',
          promotionLevel: 2,
          reasoning: 'This matches the persona well',
        }),
      };
    }

    if (systemPrompt.includes('You are a content quality reviewer')) {
      // QualityGate response
      return {
        ...result,
        content: JSON.stringify({
          authenticity: 8,
          value: 7,
          promotionalSmell: 3,
          personaConsistency: 9,
          communityFit: 8,
          comments: 'Authentic voice, genuine value, light promotion',
        }),
      };
    }

    if (systemPrompt.includes('You are the Campaign Lead')) {
      // CampaignLead response
      let decision = 'post';
      if (responseMode === 'reject') decision = 'reject';
      else if (responseMode === 'escalate') decision = 'escalate';

      return {
        ...result,
        content: JSON.stringify({
          decision,
          reasoning: `Good fit for ${responseMode}`,
        }),
      };
    }

    // ContentWriter or others
    return {
      ...result,
      content:
        'Yeah, I had the same issue with call forwarding. Been using this for 4 months now, catches most of our missed calls.',
    };
  };

  const router = new InMemoryLLMRouter({
    providers: [provider],
    tracker: new InMemoryBudgetTracker({ monthlyCapCents: 100_000 }),
    config: {
      mode: 'primary',
      sensitiveTaskTypes: [],
      routes: {
        strategy: {
          primary: { providerId: 'test-stub', model: 'test-1' },
          fallback: { providerId: 'test-stub', model: 'test-1' },
        },
        content_writing: {
          primary: { providerId: 'test-stub', model: 'test-1' },
          fallback: { providerId: 'test-stub', model: 'test-1' },
        },
        classification: {
          primary: { providerId: 'test-stub', model: 'test-1' },
          fallback: { providerId: 'test-stub', model: 'test-1' },
        },
        decision: {
          primary: { providerId: 'test-stub', model: 'test-1' },
          fallback: { providerId: 'test-stub', model: 'test-1' },
        },
      },
    },
  });

  return router;
}

describe('OrchestratorService', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('happy path: strategist → writer → quality → safety → lead, then persists approved plan', async () => {
    const { productId, legendId, legendAccountId, communityId } = await setupContext();
    const router = makeStubRouter('happy', {
      strategistLegendId: legendId,
      strategistCommunityId: communityId,
    });
    const service = new OrchestratorService({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    const result = await service.draft({
      productId,
      campaignGoal: 'Build community presence',
    });

    expect(result.contentPlan).toBeDefined();
    expect(result.contentPlan.status).toBe('approved');
    expect(result.contentPlan.generatedContent).toContain('missed calls');
    expect(result.contentPlan.qualityScore).toBeDefined();
    expect(result.trace.decision.decision).toBe('post');
    expect(result.totalCostMillicents).toBeGreaterThan(0);
  });

  it('campaign lead rejects: status becomes rejected', async () => {
    const { productId, legendId, communityId } = await setupContext();
    const router = makeStubRouter('reject', {
      strategistLegendId: legendId,
      strategistCommunityId: communityId,
    });
    const service = new OrchestratorService({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    const result = await service.draft({
      productId,
      campaignGoal: 'Build community presence',
    });

    expect(result.contentPlan.status).toBe('rejected');
    expect(result.contentPlan.rejectionReason).toContain('reject');
    expect(result.trace.decision.decision).toBe('reject');
  });

  it('campaign lead escalates: status becomes review', async () => {
    const { productId, legendId, communityId } = await setupContext();
    const router = makeStubRouter('escalate', {
      strategistLegendId: legendId,
      strategistCommunityId: communityId,
    });
    const service = new OrchestratorService({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    const result = await service.draft({
      productId,
      campaignGoal: 'Build community presence',
    });

    expect(result.contentPlan.status).toBe('review');
    expect(result.trace.decision.decision).toBe('escalate');
  });

  it('no legends for product: throws OrchestratorNoLegendsError', async () => {
    const db = getDb();
    const [fakeProduct] = await db
      .insert(products)
      .values({
        name: 'Empty Product',
        slug: `${PREFIX}empty-${Date.now()}`,
        description: 'No legends',
        status: 'active',
        valueProps: ['test'],
        painPoints: [],
        talkingPoints: [],
      })
      .returning();

    const router = makeStubRouter('happy');
    const service = new OrchestratorService({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    try {
      await service.draft({
        productId: fakeProduct!.id,
        campaignGoal: 'Build community presence',
      });
      expect.fail('Should have thrown OrchestratorNoLegendsError');
    } catch (err) {
      expect(err).toBeInstanceOf(OrchestratorNoLegendsError);
    }
  });

  it('throws OrchestratorNoAccountError if legend has no account on chosen platform', async () => {
    const { productId } = await setupContext();
    const db = getDb();

    // Create a second legend without any account
    const [legend2] = await db
      .insert(legends)
      .values({
        productId,
        firstName: `${PREFIX}Carol`,
        lastName: 'NoAccount',
        gender: 'female',
        age: 35,
        location: { city: 'Austin', state: 'TX', country: 'USA', timezone: 'America/Chicago' },
        lifeDetails: { maritalStatus: 'single' },
        professional: {
          occupation: 'Engineer',
          company: 'Tech',
          industry: 'Tech',
          yearsExperience: 5,
          education: 'Bachelors',
        },
        bigFive: {
          openness: 7,
          conscientiousness: 8,
          extraversion: 6,
          agreeableness: 7,
          neuroticism: 3,
        },
        techSavviness: 8,
        typingStyle: {
          capitalization: 'normal',
          punctuation: 'standard',
          commonTypos: [],
          commonPhrases: [],
          avoidedPhrases: [],
          paragraphStyle: 'concise',
          listStyle: 'often',
          usesEmojis: false,
          formality: 6,
        },
        activeHours: { start: 9, end: 17 },
        activeDays: [1, 2, 3, 4, 5],
        averagePostLength: 'medium',
        hobbies: ['coding'],
        expertiseAreas: ['backend'],
        knowledgeGaps: [],
        productRelationship: {
          discoveryStory: 'Found it online',
          usageDuration: '6 months',
          satisfactionLevel: 9,
          complaints: [],
          useCase: 'daily work',
          alternativesConsidered: [],
        },
        opinions: {},
        neverDo: [],
        maturity: 'engaging',
      })
      .returning();

    // Get first community to pass to the strategist
    const [firstCommunity] = await db.select().from(communities).limit(1);
    if (!firstCommunity) throw new Error('No communities found');

    const router = makeStubRouter('happy', {
      strategistLegendId: legend2!.id, // Pick the legend without an account
      strategistCommunityId: firstCommunity.id,
    });

    const service = new OrchestratorService({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    try {
      await service.draft({
        productId,
        campaignGoal: 'Build community presence',
      });
      expect.fail('Should have thrown OrchestratorNoAccountError');
    } catch (err) {
      expect(err).toBeInstanceOf(OrchestratorNoAccountError);
    }
  });
});
