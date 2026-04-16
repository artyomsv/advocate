# Content Writer Agent Implementation Plan (Plan 11a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First agent that actually runs end-to-end. Ties together everything built so far — the `LLMRouter`, the three-layer prompt composer, the Legend + Product data — into a single `ContentWriter` agent that takes a brief and returns a generated draft. Exposes a `POST /agents/content-writer/draft` endpoint so the owner can send one curl and see real LLM-generated content in the persona's voice.

**Architecture:** `BaseAgent` is a tiny class that holds shared dependencies (the router, db, logger). Each concrete agent (ContentWriter here; others in Plan 11b) extends it with a single typed method that matches one of the engine's role interfaces. An `AgentFactory` builds the instances with proper dependency wiring. The BullMQ-backed runtime that orchestrates multiple agents arrives in Plan 11c — this plan is the simplest possible "call an agent synchronously" flow.

**Tech Stack:** Existing — `@advocate/engine`, `LLMRouter`, `createDefaultRouter`, prompts module. No new dependencies.

**Prerequisites:**
- Plan 10 complete (tag `plan10-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`
- At least one LLM provider API key in `.env` to see real generation (otherwise the stub provider returns "stub response")

---

## File Structure Overview

```
packages/app/src/agents/
├── index.ts
├── types.ts                        # DraftRequest, DraftResponse, AgentContext
├── base-agent.ts                   # BaseAgent — shared deps + helpers
├── content-writer.ts               # ContentWriter extends BaseAgent implements ContentCreatorRole
└── factory.ts                      # createContentWriter(deps) — the wiring

packages/app/src/server/routes/
└── agents.ts                       # POST /agents/content-writer/draft

packages/app/tests/agents/
├── base-agent.test.ts              # Unit
├── content-writer.test.ts          # Integration with StubLLMProvider
└── agents.integration.test.ts      # Full HTTP round-trip with stub router
```

## Design decisions

1. **BaseAgent is a thin shared-deps holder, not a framework.** It carries `{ router, db, logger }`; each concrete agent gets them via the constructor. No inheritance gymnastics, no "Template Method pattern" — concrete agents override nothing.

2. **ContentWriter returns LlmResponse + assembled prompts.** Callers get the draft text AND the raw router metadata (which provider, which model, cost). The HTTP layer can choose what to surface.

3. **Dependencies are injected via factory, not the router.** `createContentWriter({ router, db, logger })` → `ContentWriter` instance. Tests substitute a `StubLLMProvider` wired into an `InMemoryLLMRouter` with a single routing entry.

4. **Synchronous invocation.** No BullMQ, no message bus — just `agent.generateDraft(brief)`. The real orchestration layer (Plan 11c) will wrap these methods in job queues, but this plan proves the call chain works.

5. **HTTP surface exercises the full stack.** The integration test hits `POST /agents/content-writer/draft` with a real legend + product id (created in the same test). Response asserts non-empty draft content + provider + cost > 0.

6. **Default router gets wired in server.ts.** A module-level `router` created from `createDefaultRouter(env)` is passed to the factory when the route registers. Falls back to the stub when no API keys are set, so the endpoint always responds (just with `stub response` content).

---

## Task 1: Agent Types + BaseAgent

**Files:**
- Create: `packages/app/src/agents/types.ts`
- Create: `packages/app/src/agents/base-agent.ts`
- Create: `packages/app/tests/agents/base-agent.test.ts`

- [ ] **Step 1.1: Create `packages/app/src/agents/types.ts`**

```typescript
import type { LLMRouter, LlmResponse } from '@advocate/engine';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pino from 'pino';
import type * as schema from '../db/schema.js';
import type { PromptContext } from '../prompts/types.js';

/**
 * Shared runtime dependencies available to every agent. Concrete agents
 * may depend on a subset.
 */
export interface AgentDeps {
  router: LLMRouter;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
}

/**
 * Input for generating a draft. `productId` is optional — pure community
 * engagement doesn't involve a product mention.
 */
export interface DraftRequest {
  legendId: string;
  productId?: string;
  communityId?: string;
  task: PromptContext['task'];
  platform?: PromptContext['platform'];
  community?: PromptContext['community'];
  thread?: PromptContext['thread'];
  relevantMemories?: readonly string[];
  recentActivity?: readonly string[];
}

/**
 * Output from the ContentWriter. Includes the raw LLM metadata so the
 * dashboard / cost center can show what actually ran.
 */
export interface DraftResponse {
  content: string;
  /** The system prompt we sent — useful for debugging + dashboard preview. */
  systemPrompt: string;
  /** The user prompt we sent — same. */
  userPrompt: string;
  llm: {
    providerId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costMillicents: number;
    latencyMs: number;
  };
}
```

- [ ] **Step 1.2: Write failing test FIRST**

Create `packages/app/tests/agents/base-agent.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  StubLLMProvider,
} from '@advocate/engine';
import pino from 'pino';
import { BaseAgent } from '../../src/agents/base-agent.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDeps(): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: 'canned',
    usage: { inputTokens: 10, outputTokens: 5 },
    costMillicents: 100,
    latencyMs: 10,
  });

  return {
    router: new InMemoryLLMRouter({
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
    }),
    db: {} as AgentDeps['db'], // unused for BaseAgent's own tests
    logger: pino({ level: 'silent' }),
  };
}

class TestAgent extends BaseAgent {
  readonly name = 'test-agent';
}

describe('BaseAgent', () => {
  it('stores deps and exposes router + logger', () => {
    const deps = makeDeps();
    const a = new TestAgent(deps);
    expect(a.deps.router).toBe(deps.router);
    expect(a.deps.logger).toBe(deps.logger);
    expect(a.name).toBe('test-agent');
  });

  it('callLlm delegates to router.generate and includes agent.name in task context', async () => {
    const deps = makeDeps();
    const agent = new TestAgent(deps);
    const result = await agent.callLlm({
      taskType: 'content_writing',
      systemPrompt: 'sys',
      userPrompt: 'user',
    });
    expect(result.content).toBe('canned');
    expect(result.providerId).toBe('stub');
    expect(result.costMillicents).toBe(100);
  });
});
```

- [ ] **Step 1.3: Run test — MUST FAIL**

```bash
mkdir -p packages/app/tests/agents
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/app test base-agent
```

- [ ] **Step 1.4: Implement `packages/app/src/agents/base-agent.ts`**

```typescript
import type { LlmResponse } from '@advocate/engine';
import type { AgentDeps } from './types.js';

export interface LlmCall {
  taskType: string;
  systemPrompt: string;
  userPrompt: string;
  /** Force the router to treat this call as sensitive regardless of task type. */
  sensitive?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Shared dependency container for every concrete agent. Subclasses add
 * methods that call the LLM router + persistence via `deps`.
 */
export abstract class BaseAgent {
  readonly deps: AgentDeps;
  abstract readonly name: string;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  /** Common LLM call shape — delegates to the router with agent-context logging. */
  protected async callLlm(call: LlmCall): Promise<LlmResponse> {
    this.deps.logger.debug(
      { agent: this.name, taskType: call.taskType },
      'agent issuing LLM call',
    );
    return this.deps.router.generate(
      call.taskType,
      {
        systemPrompt: call.systemPrompt,
        userPrompt: call.userPrompt,
        temperature: call.temperature,
        maxTokens: call.maxTokens,
      },
      { sensitive: call.sensitive },
    );
  }
}
```

- [ ] **Step 1.5: Run + commit**

```bash
pnpm --filter @advocate/app test base-agent
pnpm lint
git add packages/app/src/agents/types.ts packages/app/src/agents/base-agent.ts packages/app/tests/agents/base-agent.test.ts
git commit -m "feat(app): add BaseAgent + agent types (DraftRequest/Response, AgentDeps)"
```

---

## Task 2: ContentWriter Agent

**Files:**
- Create: `packages/app/src/agents/content-writer.ts`
- Create: `packages/app/src/agents/factory.ts`
- Create: `packages/app/tests/agents/content-writer.test.ts`

- [ ] **Step 2.1: Write failing integration test FIRST**

Create `packages/app/tests/agents/content-writer.test.ts`:

```typescript
import { like } from 'drizzle-orm';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  StubLLMProvider,
} from '@advocate/engine';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import { createContentWriter } from '../../src/agents/factory.js';

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
  const productId = product!.id;

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
      professional: { occupation: 'Plumber', company: 'Kowalski Plumbing', industry: 'Trades', yearsExperience: 15, education: 'Trade school' },
      bigFive: { openness: 4, conscientiousness: 8, extraversion: 5, agreeableness: 6, neuroticism: 4 },
      techSavviness: 3,
      typingStyle: {
        capitalization: 'mixed', punctuation: 'minimal', commonTypos: [], commonPhrases: [],
        avoidedPhrases: [], paragraphStyle: 'varied', listStyle: 'never', usesEmojis: false, formality: 4,
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
  return { legendId: legend!.id, productId };
}

function makeRouterCapturing(expectedSubstrings: string[]) {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  let capturedSystemPrompt = '';
  let capturedUserPrompt = '';
  // Wrap setDefaultStub with a side-effect that captures prompts
  provider.setDefaultStub({
    content: 'Yeah I had the same issue. We ended up using Foreman — $99/mo, caught 6 calls the first week.',
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

  return { router, getCapturedSystem: () => capturedSystemPrompt, getCapturedUser: () => capturedUserPrompt };
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
    expect(getCapturedSystem()).toContain('Dave');
    expect(getCapturedSystem()).toContain('Plumber');
    expect(getCapturedSystem()).toContain('Columbus');
    expect(getCapturedSystem()).toContain('AI phone answering');
    expect(getCapturedUser()).toContain('experience_share');
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
```

- [ ] **Step 2.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/app test content-writer
```

- [ ] **Step 2.3: Implement `packages/app/src/agents/content-writer.ts`**

```typescript
import { eq } from 'drizzle-orm';
import { legends, products } from '../db/schema.js';
import { composePrompt } from '../prompts/composer.js';
import { BaseAgent } from './base-agent.js';
import type { DraftRequest, DraftResponse } from './types.js';

export class ContentWriter extends BaseAgent {
  readonly name = 'content-writer';

  async generateDraft(request: DraftRequest): Promise<DraftResponse> {
    const [legend] = await this.deps.db
      .select()
      .from(legends)
      .where(eq(legends.id, request.legendId))
      .limit(1);
    if (!legend) {
      throw new Error(`Legend ${request.legendId} not found`);
    }

    let product = null;
    if (request.productId) {
      const [row] = await this.deps.db
        .select()
        .from(products)
        .where(eq(products.id, request.productId))
        .limit(1);
      if (!row) {
        throw new Error(`Product ${request.productId} not found`);
      }
      product = row;
    }

    const composed = composePrompt({
      legend,
      product,
      context: {
        task: request.task,
        platform: request.platform,
        community: request.community,
        thread: request.thread,
        relevantMemories: request.relevantMemories,
        recentActivity: request.recentActivity,
      },
    });

    const response = await this.callLlm({
      taskType: 'content_writing',
      systemPrompt: composed.systemPrompt,
      userPrompt: composed.userPrompt,
      temperature: 0.8,
    });

    return {
      content: response.content,
      systemPrompt: composed.systemPrompt,
      userPrompt: composed.userPrompt,
      llm: {
        providerId: response.providerId,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cachedTokens: response.usage.cachedTokens ?? 0,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }
}
```

- [ ] **Step 2.4: Implement `packages/app/src/agents/factory.ts`**

```typescript
import { ContentWriter } from './content-writer.js';
import type { AgentDeps } from './types.js';

export function createContentWriter(deps: AgentDeps): ContentWriter {
  return new ContentWriter(deps);
}
```

- [ ] **Step 2.5: Run test + commit**

```bash
pnpm --filter @advocate/app test content-writer
pnpm lint
git add packages/app/src/agents/content-writer.ts packages/app/src/agents/factory.ts packages/app/tests/agents/content-writer.test.ts
git commit -m "feat(app): add ContentWriter agent (Soul + Product + Context → LLM draft)"
```

---

## Task 3: HTTP Route

**Files:**
- Create: `packages/app/src/server/routes/agents.ts`
- Create: `packages/app/tests/agents/agents.integration.test.ts`
- Modify: `packages/app/src/server/server.ts` (register route + build the router at startup)

- [ ] **Step 3.1: Write failing integration test FIRST**

Create `packages/app/tests/agents/agents.integration.test.ts`:

```typescript
import { like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { legends, products } from '../../src/db/schema.js';
import { buildServer } from '../../src/server/server.js';

const PREFIX = 'canary-agent-http-';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(legends).where(like(legends.firstName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('/agents/content-writer/draft', () => {
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

  async function seed(): Promise<{ legendId: string; productId: string }> {
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        name: 'FBS',
        slug: `${PREFIX}product-${Date.now()}`,
        description: 'x',
        status: 'draft',
        valueProps: ['v'], painPoints: ['p'], talkingPoints: ['t'],
      })
      .returning();
    const productId = product!.id;

    const [legend] = await db
      .insert(legends)
      .values({
        productId,
        firstName: `${PREFIX}Jane`,
        lastName: 'Doe',
        gender: 'female',
        age: 30,
        location: { city: 'x', state: 'x', country: 'USA', timezone: 'UTC' },
        lifeDetails: { maritalStatus: 'single' },
        professional: { occupation: 'x', company: 'x', industry: 'x', yearsExperience: 1, education: 'x' },
        bigFive: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
        techSavviness: 5,
        typingStyle: {
          capitalization: 'proper', punctuation: 'correct', commonTypos: [], commonPhrases: [],
          avoidedPhrases: [], paragraphStyle: 'short', listStyle: 'never', usesEmojis: false, formality: 5,
        },
        activeHours: { start: 9, end: 17 },
        activeDays: [1, 2, 3, 4, 5],
        averagePostLength: 'short',
        hobbies: ['x'],
        expertiseAreas: ['x'],
        knowledgeGaps: [],
        productRelationship: {
          discoveryStory: 'x', usageDuration: '1m', satisfactionLevel: 7, complaints: [],
          useCase: 'x', alternativesConsidered: [],
        },
        opinions: {},
        neverDo: [],
        maturity: 'lurking',
      })
      .returning();
    return { legendId: legend!.id, productId };
  }

  it('POST /agents/content-writer/draft → 200 with content + llm metadata', async () => {
    const { legendId, productId } = await seed();
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: {
        legendId,
        productId,
        task: {
          type: 'helpful_comment',
          promotionLevel: 0,
          instructions: 'Reply helpfully.',
        },
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<{ content: string; llm: { providerId: string; costMillicents: number } }>();
    expect(body.content.length).toBeGreaterThan(0);
    expect(body.llm.providerId).toBeDefined();
    expect(body.llm.costMillicents).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it('POST /agents/content-writer/draft → 400 on missing fields', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: { legendId: 'not-a-uuid' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /agents/content-writer/draft → 404 when legend unknown', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/agents/content-writer/draft',
      payload: {
        legendId: '00000000-0000-4000-8000-000000000000',
        task: { type: 'helpful_comment', promotionLevel: 0, instructions: 'x' },
      },
    });
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3.2: Run — MUST FAIL**

- [ ] **Step 3.3: Implement `packages/app/src/server/routes/agents.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import type { LLMRouter } from '@advocate/engine';
import { createContentWriter } from '../../agents/factory.js';
import { getDb } from '../../db/connection.js';

const draftRequestSchema = z.object({
  legendId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  communityId: z.string().uuid().optional(),
  task: z.object({
    type: z.string().min(1),
    promotionLevel: z.number().int().min(0).max(10),
    instructions: z.string().min(1),
  }),
  platform: z.object({ id: z.string(), name: z.string() }).optional(),
  community: z.object({
    id: z.string(),
    name: z.string(),
    platform: z.string(),
    rulesSummary: z.string().optional(),
    cultureSummary: z.string().optional(),
  }).optional(),
  thread: z.object({ url: z.string().optional(), summary: z.string() }).optional(),
  relevantMemories: z.array(z.string()).optional(),
  recentActivity: z.array(z.string()).optional(),
});

export interface AgentRoutesDeps {
  router: LLMRouter;
  logger: pino.Logger;
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: AgentRoutesDeps,
): Promise<void> {
  const writer = createContentWriter({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  app.post('/agents/content-writer/draft', async (req, reply) => {
    const parsed = draftRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    try {
      const result = await writer.generateDraft(parsed.data);
      return result;
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return reply.code(404).send({ error: 'NotFound', message: err.message });
      }
      req.log.error({ err }, 'content writer draft failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });
}
```

- [ ] **Step 3.4: Modify `packages/app/src/server/server.ts`**

At the top of `buildServer`, after the Fastify instance is created, build the default router and pass it to the agent routes registration.

```typescript
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis } from '../queue/connection.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerLegendAccountRoutes } from './routes/legend-accounts.js';
import { registerLegendRoutes } from './routes/legends.js';
import { registerProductRoutes } from './routes/products.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
  });

  // Build the default LLM router once per server instance.
  const { router } = createDefaultRouter({ env: getEnv() });

  await registerHealthRoutes(app);
  await registerProductRoutes(app);
  await registerLegendRoutes(app);
  await registerLegendAccountRoutes(app);
  await registerAgentRoutes(app, { router, logger });

  app.addHook('onClose', async () => {
    await Promise.all([closeDb(), closeRedis()]);
  });

  return app;
}

export async function start(): Promise<void> {
  const env = getEnv();
  const app = await buildServer();
  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err, 'failed to start server');
    process.exit(1);
  }
}

const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start();
}
```

- [ ] **Step 3.5: Run test + commit + push**

```bash
pnpm --filter @advocate/app test agents.integration
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/agents.ts packages/app/src/server/server.ts packages/app/tests/agents/agents.integration.test.ts
git commit -m "feat(app): add POST /agents/content-writer/draft endpoint"
git push origin master
```

---

## Task 4: Barrel + Docker Smoke Test + Tag

- [ ] **Step 4.1: Create barrel**

`packages/app/src/agents/index.ts`:

```typescript
export * from './base-agent.js';
export * from './content-writer.js';
export * from './factory.js';
export * from './types.js';
```

- [ ] **Step 4.2: Verify + commit + push**

```bash
pnpm --filter @advocate/app test
pnpm --filter @advocate/app typecheck
pnpm lint
git add packages/app/src/agents/index.ts
git commit -m "feat(app): expose agents module via barrel"
git push origin master
```

- [ ] **Step 4.3: Docker round-trip with real-LLM smoke test**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps

# Create a product
PROD_RESP=$(curl -s -X POST http://localhost:36401/products -H 'Content-Type: application/json' -d '{"name":"Demo","slug":"demo-writer","description":"Demo product","valueProps":["v"],"painPoints":["p"],"talkingPoints":["t"]}')
PROD_ID=$(echo "$PROD_RESP" | node -e "let d=''; process.stdin.on('data', c => d+=c); process.stdin.on('end', () => console.log(JSON.parse(d).id))")

# Create a legend (use the minimal shape; see agents.integration.test.ts)
# — reuse the fixture from the integration test for a realistic payload
# OR skip the smoke test here since the integration test already proves it works

# Call the draft endpoint
curl -s -X POST http://localhost:36401/agents/content-writer/draft \
  -H 'Content-Type: application/json' \
  -d "{\"legendId\":\"<put-a-legend-id-here>\",\"productId\":\"$PROD_ID\",\"task\":{\"type\":\"helpful_comment\",\"promotionLevel\":0,\"instructions\":\"Reply helpfully.\"}}"

# Cleanup
curl -s -X DELETE http://localhost:36401/products/$PROD_ID
docker compose down
```

In practice the smoke test can be simplified to: `/health` still works after rebuild. The integration test proves the agent flow end-to-end.

- [ ] **Step 4.4: Tag + push**

```bash
git tag -a plan11a-complete -m "Plan 11a Content Writer agent complete"
git push origin plan11a-complete
```

---

## Acceptance Criteria

1. ✅ `BaseAgent` + agent types shipped
2. ✅ `ContentWriter` implements end-to-end flow: fetch legend + product → compose prompts → call router → return draft
3. ✅ `POST /agents/content-writer/draft` endpoint with 200 / 400 / 404
4. ✅ Server builds a `LLMRouter` at startup and passes it to the agent route
5. ✅ Tests pass: ~197 (existing) + ~2 base-agent + ~3 content-writer + ~3 agents-http ≈ 205
6. ✅ Docker stack boots healthy
7. ✅ Tag `plan11a-complete` pushed

## Out of Scope

- **Other agents** (Strategist, Scout, Quality Gate, etc.) → Plan 11b
- **BullMQ-backed AgentRuntime** → Plan 11c
- **Memory + task persistence** → Plan 11.5
- **Auth on the agent route** → Plan 12 (Keycloak)
- **Saving the generated draft as a `content_plan`** — right now the endpoint just returns the draft; persistence of drafts is Plan 11b

---

**End of Plan 11a (Content Writer Agent).**
