import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@mynah/engine';
import { like } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createContentWriter } from '../../src/agents/factory.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';

const PREFIX = 'canary-writer-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

async function seedLegendAndProduct(): Promise<{ legendId: string; productId: string }> {
  const db = getDb();
  const [product] = await db
    .insert(products)
    .values({
      name: 'Test',
      slug: `${PREFIX}product-${Date.now()}`,
      description: 'AI phone answering for contractors',
      status: 'draft',
      valueProps: ['$99/mo', '24/7'],
      painPoints: ['missed calls'],
      talkingPoints: ['first week paid for itself'],
    })
    .returning();
  const productId = product?.id;
  if (!productId) throw new Error('Product creation failed');

  const [legend] = await db
    .insert(legends)
    .values({
      productId,
      firstName: `${PREFIX}Dave`,
      lastName: 'Test',
      gender: 'male',
      age: 42,
      location: { city: 'Columbus', state: 'OH', country: 'USA', timezone: 'America/New_York' },
      lifeDetails: { maritalStatus: 'married', partnerName: 'Karen' },
      professional: {
        occupation: 'Plumber',
        company: 'Kowalski Plumbing',
        industry: 'Trades',
        yearsExperience: 15,
        education: 'Trade school',
      },
      bigFive: {
        openness: 4,
        conscientiousness: 8,
        extraversion: 5,
        agreeableness: 6,
        neuroticism: 4,
      },
      techSavviness: 3,
      typingStyle: {
        capitalization: 'mixed',
        punctuation: 'minimal',
        commonTypos: [],
        commonPhrases: [],
        avoidedPhrases: [],
        paragraphStyle: 'varied',
        listStyle: 'never',
        usesEmojis: false,
        formality: 4,
      },
      activeHours: { start: 6, end: 19 },
      activeDays: [1, 2, 3, 4, 5, 6],
      averagePostLength: 'medium',
      hobbies: ['football'],
      expertiseAreas: ['plumbing'],
      knowledgeGaps: ['tech'],
      productRelationship: {
        discoveryStory: 'Karen found it.',
        usageDuration: '2 months',
        satisfactionLevel: 8,
        complaints: [],
        useCase: 'answering phone',
        alternativesConsidered: [],
      },
      opinions: {},
      neverDo: ['use marketing jargon'],
      maturity: 'lurking',
    })
    .returning();
  const legendId = legend?.id;
  if (!legendId) throw new Error('Legend creation failed');
  return { legendId, productId };
}

function makeRouterCapturing(_expectedSubstrings: string[]) {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  let capturedSystemPrompt = '';
  let capturedUserPrompt = '';
  // Wrap setDefaultStub with a side-effect that captures prompts
  provider.setDefaultStub({
    content:
      'Yeah I had the same issue. We ended up using Foreman — $99/mo, caught 6 calls the first week.',
    usage: { inputTokens: 200, outputTokens: 30 },
    costMillicents: 120,
    latencyMs: 50,
  });
  // Monkey-patch: wrap generate to capture prompts
  const origGenerate = provider.generate.bind(provider);
  provider.generate = async (model, req) => {
    capturedSystemPrompt = req.systemPrompt;
    capturedUserPrompt = req.userPrompt;
    return origGenerate(model, req);
  };

  const router = new InMemoryLLMRouter({
    providers: [provider],
    tracker: new InMemoryBudgetTracker({ monthlyCapCents: 2000 }),
    config: {
      mode: 'primary',
      sensitiveTaskTypes: [],
      routes: {
        content_writing: {
          primary: { providerId: 'stub', model: 'stub-1' },
          fallback: { providerId: 'stub', model: 'stub-1' },
          budget: { providerId: 'stub', model: 'stub-1' },
        },
      },
    },
  });

  return {
    router,
    getCapturedSystem: () => capturedSystemPrompt,
    getCapturedUser: () => capturedUserPrompt,
  };
}

describe('ContentWriter (integration)', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('generates a draft using Soul + Product Knowledge + Context', async () => {
    const { legendId, productId } = await seedLegendAndProduct();
    const { router, getCapturedSystem, getCapturedUser } = makeRouterCapturing([]);

    const agent = createContentWriter({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    const result = await agent.generateDraft({
      legendId,
      productId,
      task: {
        type: 'experience_share',
        promotionLevel: 4,
        instructions: 'Write a reply describing your experience with the product.',
      },
    });

    expect(result.content.length).toBeGreaterThan(0);
    expect(result.llm.providerId).toBe('stub');
    expect(result.llm.costMillicents).toBe(120);

    // Verify the prompt actually contains the legend + product material
    const systemPrompt = getCapturedSystem();
    expect(systemPrompt).toContain('Dave');
    expect(systemPrompt).toContain('Plumber');
    expect(systemPrompt).toContain('Columbus');
    expect(systemPrompt).toContain('AI phone answering');
    expect(systemPrompt).toContain('experience_share'); // task type in context block
    expect(getCapturedUser()).toContain('Write a reply describing');
  });

  it('omits Product Knowledge section when productId is not provided', async () => {
    const { legendId } = await seedLegendAndProduct();
    const { router, getCapturedSystem } = makeRouterCapturing([]);

    const agent = createContentWriter({
      router,
      db: getDb(),
      logger: pino({ level: 'silent' }),
    });

    await agent.generateDraft({
      legendId,
      task: {
        type: 'helpful_comment',
        promotionLevel: 0,
        instructions: 'Reply helpfully.',
      },
    });

    // No product knowledge section ⇒ no product name in the prompt
    expect(getCapturedSystem()).toContain('Dave');
    expect(getCapturedSystem()).not.toContain('AI phone answering');
  });

  it('throws if legendId does not exist', async () => {
    const { router } = makeRouterCapturing([]);
    const agent = createContentWriter({ router, db: getDb(), logger: pino({ level: 'silent' }) });

    await expect(
      agent.generateDraft({
        legendId: '00000000-0000-4000-8000-000000000000',
        task: { type: 'helpful_comment', promotionLevel: 0, instructions: 'x' },
      }),
    ).rejects.toThrow(/legend.*not found/i);
  });
});
