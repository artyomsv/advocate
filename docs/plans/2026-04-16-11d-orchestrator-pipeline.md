# Orchestrator Pipeline Implementation Plan (Plan 11d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compose the 5 agents (Strategist → ContentWriter → QualityGate → SafetyWorker → CampaignLead) into a single `OrchestratorService.draft()` call that produces a persisted `content_plan` with status set according to the CampaignLead's decision. One HTTP endpoint (`POST /orchestrate/draft`) kicks off the full chain. After this plan, you can send a single curl and watch 4 agents collaborate autonomously.

**Architecture:** Orchestrator owns the sequence. It fetches available Legends + Communities from the DB (filtered by campaign), invokes each agent in turn, persists the result as a `content_plan` row with quality score attached, and returns a summary with the plan id + decision + all intermediate outputs for debugging. Safety is a hard gate: if it rejects, the pipeline short-circuits before CampaignLead is called (same pattern as CampaignLead's internal safety check).

**Tech Stack:** Existing. Drizzle for `content_plans` persistence. Agents from Plans 11a/11b/11c.

**Prerequisites:**
- Plan 11c complete (tag `plan11c-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/app/src/orchestrator/
├── index.ts
├── types.ts                         # OrchestratorInput, OrchestratorResult
└── orchestrator.service.ts          # OrchestratorService.draft(input)

packages/app/src/content-plans/
├── index.ts
├── types.ts                         # re-exports
└── content-plan.repository.ts       # Thin Drizzle wrapper for content_plans

packages/app/src/server/routes/
└── orchestrate.ts                   # POST /orchestrate/draft

packages/app/tests/orchestrator/
├── content-plan.repository.test.ts  # Integration with Postgres
├── orchestrator.service.test.ts     # Integration with stub LLMs + real DB
└── orchestrate.http.test.ts         # Route test
```

## Design decisions

1. **Orchestrator is a service, not an agent.** It doesn't extend BaseAgent — it composes multiple agents. This keeps the agent abstraction pure (agents make one kind of LLM call; orchestrator stitches them together).

2. **Fetches Legends + Communities from the DB at entry.** Caller provides `productId` + optional filters; orchestrator queries for associated legends and "active" communities. Strategist sees the full list and picks one.

3. **Persists a `content_plan` row on every call.** Status reflects the CampaignLead decision:
   - `'post'` → `approved` + `reviewedBy: 'orchestrator'`
   - `'revise'` → `rejected` + `rejectionReason: 'needs revision: <reasoning>'`
   - `'reject'` → `rejected` + `rejectionReason: <reasoning>`
   - `'escalate'` → `review` (awaits human)
   - Safety failure → `rejected` + `rejectionReason: <safety reason>`

4. **`qualityScore` column gets the JSON from QualityGate.** Dashboard can render scores later without recomputing.

5. **Return value is a flat summary.** Not just the content_plan row — also each agent's output so callers can inspect/log/debug.

6. **Fail fast on missing inputs.** If no legends/communities exist for a product, throw immediately with a clear error. The route maps that to 422 Unprocessable Entity.

---

## Task 1: ContentPlanRepository

**Files:**
- Create: `packages/app/src/content-plans/types.ts`
- Create: `packages/app/src/content-plans/content-plan.repository.ts`
- Create: `packages/app/tests/orchestrator/content-plan.repository.test.ts`

- [ ] **Step 1.1: Create `packages/app/src/content-plans/types.ts`**

```typescript
export type { ContentPlan, NewContentPlan } from '../db/schema.js';
```

- [ ] **Step 1.2: Write failing test FIRST**

Create `packages/app/tests/orchestrator/content-plan.repository.test.ts`. It needs setup: product → legend → legendAccount → community. Use `canary-cplan-` prefix. 6 tests:

- `create` inserts and returns with id + timestamps
- `findById` returns row / null
- `listByLegend` filters by legend
- `listByStatus` filters by status
- `update` patches + returns updated / null on missing
- `remove` returns boolean

Full test setup follows the pattern from Plan 11a's content-writer.test.ts (seeds product + legend + legendAccount + community, then tests CRUD).

- [ ] **Step 1.3: Implement `packages/app/src/content-plans/content-plan.repository.ts`**

```typescript
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { contentPlans, type ContentPlan, type NewContentPlan } from '../db/schema.js';

export class ContentPlanRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewContentPlan): Promise<ContentPlan> {
    const [row] = await this.db.insert(contentPlans).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async findById(id: string): Promise<ContentPlan | null> {
    const [row] = await this.db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.id, id))
      .limit(1);
    return row ?? null;
  }

  async listByLegend(legendId: string): Promise<readonly ContentPlan[]> {
    return this.db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.legendId, legendId))
      .orderBy(desc(contentPlans.createdAt));
  }

  async listByStatus(
    status: ContentPlan['status'],
    filter?: { legendId?: string },
  ): Promise<readonly ContentPlan[]> {
    const conds = [eq(contentPlans.status, status)];
    if (filter?.legendId) conds.push(eq(contentPlans.legendId, filter.legendId));
    return this.db
      .select()
      .from(contentPlans)
      .where(and(...conds))
      .orderBy(desc(contentPlans.createdAt));
  }

  async update(id: string, patch: Partial<NewContentPlan>): Promise<ContentPlan | null> {
    const [row] = await this.db
      .update(contentPlans)
      .set(patch)
      .where(eq(contentPlans.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db
      .delete(contentPlans)
      .where(eq(contentPlans.id, id))
      .returning({ id: contentPlans.id });
    return result.length > 0;
  }
}
```

- [ ] **Step 1.4: Run + commit**

```bash
cd E:/Projects/Stukans/advocate
mkdir -p packages/app/src/content-plans packages/app/tests/orchestrator
pnpm --filter @advocate/app test content-plan.repository
pnpm lint
git add packages/app/src/content-plans/ packages/app/tests/orchestrator/content-plan.repository.test.ts
git commit -m "feat(app): add ContentPlanRepository with status + legend filtering"
```

---

## Task 2: OrchestratorService

**Files:**
- Create: `packages/app/src/orchestrator/types.ts`
- Create: `packages/app/src/orchestrator/orchestrator.service.ts`
- Create: `packages/app/tests/orchestrator/orchestrator.service.test.ts`

- [ ] **Step 2.1: Create `packages/app/src/orchestrator/types.ts`**

```typescript
import type { StrategistPlan } from '../agents/strategist.js';
import type { QualityGateResult } from '../agents/quality-gate.js';
import type { SafetyCheckResult } from '../agents/safety-worker.js';
import type { CampaignLeadDecision } from '../agents/campaign-lead.js';
import type { ContentPlan } from '../db/schema.js';

export interface DraftOrchestrationInput {
  productId: string;
  /** Optional: narrow the Strategist's legend pool to specific ids. */
  legendIds?: readonly string[];
  /** Optional: narrow the Strategist's community pool to specific ids. */
  communityIds?: readonly string[];
  campaignGoal: string;
  /** Optional: specific thread context the Strategist should consider. */
  threadContext?: string;
}

export interface DraftOrchestrationResult {
  /** The persisted content_plan row. */
  contentPlan: ContentPlan;
  /** Everything each agent returned, for debugging / dashboard. */
  trace: {
    strategistPlan: StrategistPlan;
    draftContent: string;
    quality: QualityGateResult;
    safety: SafetyCheckResult;
    decision: CampaignLeadDecision;
  };
  /** Total cost across all LLM calls, millicents. */
  totalCostMillicents: number;
}

export class OrchestratorNoLegendsError extends Error {
  constructor(productId: string) {
    super(`No legends available for product ${productId}`);
    this.name = 'OrchestratorNoLegendsError';
  }
}

export class OrchestratorNoCommunitiesError extends Error {
  constructor() {
    super('No communities available for orchestration');
    this.name = 'OrchestratorNoCommunitiesError';
  }
}

export class OrchestratorNoAccountError extends Error {
  constructor(legendId: string, platform: string) {
    super(`Legend ${legendId} has no account on platform ${platform}`);
    this.name = 'OrchestratorNoAccountError';
  }
}
```

- [ ] **Step 2.2: Write failing integration test FIRST**

Create `packages/app/tests/orchestrator/orchestrator.service.test.ts`. This is a BIG test — seeds product + 1 legend + 1 legendAccount (reddit) + 1 community + uses a stub LLM that returns canned responses for each task type (`strategy` for Strategist + CampaignLead, `content_writing` for ContentWriter, `classification` for QualityGate).

Key test cases:
1. Happy path: draft approved → content_plan status = 'approved' with quality score attached
2. Safety-blocked path: legendAccount has postsToday = 3 (cap hit) → content_plan status = 'rejected' with safety reason
3. CampaignLead rejects: stub it to return 'reject' → status = 'rejected'
4. CampaignLead escalates: stub it to return 'escalate' → status = 'review'
5. No legends: throws OrchestratorNoLegendsError
6. No communities: throws OrchestratorNoCommunitiesError

Use distinct stub responses keyed by taskType or per-call.

Because the stub provider only has one stub queue at a time, you'll need ONE provider that can return DIFFERENT responses based on the system prompt (each agent has a distinct system prompt). Use `setStub(systemPrompt, userPrompt, body)` — but since each agent sends different system prompts (Strategist has "You are a strategist...", QualityGate has "You are a content quality reviewer..."), you can keyed them by the OPENING of the system prompt. Use a custom provider wrapper that inspects the system prompt and returns the right stub.

SIMPLEST APPROACH: override `provider.generate` directly in the test to return different responses based on an examination of the system prompt string.

- [ ] **Step 2.3: Implement `packages/app/src/orchestrator/orchestrator.service.ts`**

```typescript
import { eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pino from 'pino';
import type * as schema from '../db/schema.js';
import { communities, legendAccounts, legends, products } from '../db/schema.js';
import { CampaignLead } from '../agents/campaign-lead.js';
import { ContentWriter } from '../agents/content-writer.js';
import { QualityGate } from '../agents/quality-gate.js';
import { SafetyWorker } from '../agents/safety-worker.js';
import { Strategist } from '../agents/strategist.js';
import type { AgentDeps } from '../agents/types.js';
import { ContentPlanRepository } from '../content-plans/content-plan.repository.js';
import {
  OrchestratorNoAccountError,
  OrchestratorNoCommunitiesError,
  OrchestratorNoLegendsError,
  type DraftOrchestrationInput,
  type DraftOrchestrationResult,
} from './types.js';

export class OrchestratorService {
  readonly #deps: AgentDeps;
  readonly #repo: ContentPlanRepository;
  readonly #strategist: Strategist;
  readonly #writer: ContentWriter;
  readonly #gate: QualityGate;
  readonly #safety: SafetyWorker;
  readonly #lead: CampaignLead;

  constructor(deps: AgentDeps) {
    this.#deps = deps;
    this.#repo = new ContentPlanRepository(deps.db);
    this.#strategist = new Strategist(deps);
    this.#writer = new ContentWriter(deps);
    this.#gate = new QualityGate(deps);
    this.#safety = new SafetyWorker(deps);
    this.#lead = new CampaignLead(deps);
  }

  async draft(input: DraftOrchestrationInput): Promise<DraftOrchestrationResult> {
    const log = this.#deps.logger.child({ component: 'orchestrator' });
    log.info({ productId: input.productId }, 'orchestrator: starting draft');

    // 1. Load context
    const [product] = await this.#deps.db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error(`Product ${input.productId} not found`);

    const legendRows = await this.#deps.db
      .select()
      .from(legends)
      .where(
        input.legendIds && input.legendIds.length > 0
          ? inArray(legends.id, [...input.legendIds])
          : eq(legends.productId, input.productId),
      );
    if (legendRows.length === 0) {
      throw new OrchestratorNoLegendsError(input.productId);
    }

    const communityRows =
      input.communityIds && input.communityIds.length > 0
        ? await this.#deps.db.select().from(communities).where(inArray(communities.id, [...input.communityIds]))
        : await this.#deps.db.select().from(communities);
    if (communityRows.length === 0) {
      throw new OrchestratorNoCommunitiesError();
    }

    // 2. Strategist
    const strategistResult = await this.#strategist.planContent({
      productName: product.name,
      productOneLiner: product.description,
      campaignGoal: input.campaignGoal,
      availableLegends: legendRows.map((l) => ({
        id: l.id,
        summary: this.#summarizeLegend(l),
        maturity: l.maturity as 'lurking' | 'engaging' | 'established' | 'promoting',
      })),
      availableCommunities: communityRows.map((c) => ({
        id: c.id,
        platform: c.platform,
        name: c.name,
        culture: c.cultureSummary ?? undefined,
        rulesSummary: c.rulesSummary ?? undefined,
      })),
      threadContext: input.threadContext,
    });
    const plan = strategistResult.plan;
    log.info({ plan }, 'orchestrator: strategist plan');

    // Find the account on the chosen community's platform for the chosen legend
    const chosenCommunity = communityRows.find((c) => c.id === plan.communityId);
    if (!chosenCommunity) throw new OrchestratorNoCommunitiesError();
    const [account] = await this.#deps.db
      .select()
      .from(legendAccounts)
      .where(eq(legendAccounts.legendId, plan.legendId))
      .limit(1);
    if (!account) {
      throw new OrchestratorNoAccountError(plan.legendId, chosenCommunity.platform);
    }

    // 3. Content Writer
    const draftResult = await this.#writer.generateDraft({
      legendId: plan.legendId,
      productId: input.productId,
      communityId: plan.communityId,
      task: {
        type: plan.contentType,
        promotionLevel: plan.promotionLevel,
        instructions: `${plan.reasoning}\n\nWrite a ${plan.contentType} appropriate for ${chosenCommunity.name}.`,
      },
      community: {
        id: chosenCommunity.id,
        name: chosenCommunity.name,
        platform: chosenCommunity.platform,
        cultureSummary: chosenCommunity.cultureSummary ?? undefined,
        rulesSummary: chosenCommunity.rulesSummary ?? undefined,
      },
      thread: input.threadContext
        ? { summary: input.threadContext }
        : undefined,
    });
    log.info(
      { contentChars: draftResult.content.length, cost: draftResult.llm.costMillicents },
      'orchestrator: draft generated',
    );

    // 4. Quality Gate
    const qualityResult = await this.#gate.review({
      draftContent: draftResult.content,
      personaSummary: draftResult.systemPrompt.slice(0, 500),
      communityRules: chosenCommunity.rulesSummary ?? '',
      promotionLevel: plan.promotionLevel,
    });
    log.info(
      { approved: qualityResult.approved, score: qualityResult.score },
      'orchestrator: quality review complete',
    );

    // 5. Safety Worker
    const safetyResult = await this.#safety.check({
      legendAccountId: account.id,
      promotionLevel: plan.promotionLevel,
    });
    log.info({ allowed: safetyResult.allowed, reason: safetyResult.reason }, 'orchestrator: safety check');

    // 6. Campaign Lead (or short-circuit if safety blocked)
    const leadResult = await this.#lead.decideOnContent({
      draftContent: draftResult.content,
      personaSummary: draftResult.systemPrompt.slice(0, 500),
      qualityScore: qualityResult.score
        ? { ...qualityResult.score, comments: qualityResult.comments }
        : {
            authenticity: 0, value: 0, promotionalSmell: 10,
            personaConsistency: 0, communityFit: 0,
            comments: 'quality gate did not produce scores',
          },
      safetyResult,
      promotionLevel: plan.promotionLevel,
      campaignGoal: input.campaignGoal,
    });
    log.info({ decision: leadResult.decision.decision }, 'orchestrator: campaign lead decision');

    // 7. Map decision to content_plan status + persist
    const { status, rejectionReason, reviewedBy } = this.#mapDecision(
      leadResult.decision,
      safetyResult,
    );

    const contentPlan = await this.#repo.create({
      legendId: plan.legendId,
      legendAccountId: account.id,
      communityId: plan.communityId,
      contentType: plan.contentType,
      promotionLevel: plan.promotionLevel,
      scheduledAt: new Date(),
      status,
      generatedContent: draftResult.content,
      qualityScore: {
        ...qualityResult.score,
        comments: qualityResult.comments,
        reviewedBy: qualityResult.llm.providerId,
      },
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason,
      threadContext: input.threadContext,
    });

    const totalCostMillicents =
      strategistResult.llm.costMillicents +
      draftResult.llm.costMillicents +
      qualityResult.llm.costMillicents +
      (leadResult.llm?.costMillicents ?? 0);

    return {
      contentPlan,
      trace: {
        strategistPlan: plan,
        draftContent: draftResult.content,
        quality: qualityResult,
        safety: safetyResult,
        decision: leadResult.decision,
      },
      totalCostMillicents,
    };
  }

  #summarizeLegend(legend: typeof legends.$inferSelect): string {
    const professional = legend.professional as { occupation?: string } | null;
    const loc = legend.location as { city?: string; state?: string } | null;
    return (
      `${legend.firstName} ${legend.lastName}, age ${legend.age}, ` +
      `${professional?.occupation ?? 'unknown'} in ${loc?.city ?? '?'} ${loc?.state ?? ''}. ` +
      `Tech: ${legend.techSavviness}/10. Maturity: ${legend.maturity}.`
    );
  }

  #mapDecision(
    decision: { decision: string; reasoning: string },
    safetyResult: { allowed: boolean; reason?: string },
  ): {
    status: 'approved' | 'rejected' | 'review';
    rejectionReason?: string;
    reviewedBy: string;
  } {
    if (!safetyResult.allowed) {
      return {
        status: 'rejected',
        rejectionReason: `safety: ${safetyResult.reason ?? 'blocked'}`,
        reviewedBy: 'orchestrator',
      };
    }
    switch (decision.decision) {
      case 'post':
        return { status: 'approved', reviewedBy: 'orchestrator' };
      case 'revise':
        return {
          status: 'rejected',
          rejectionReason: `needs revision: ${decision.reasoning}`,
          reviewedBy: 'orchestrator',
        };
      case 'reject':
        return {
          status: 'rejected',
          rejectionReason: decision.reasoning,
          reviewedBy: 'orchestrator',
        };
      case 'escalate':
        return { status: 'review', reviewedBy: 'orchestrator' };
      default:
        return {
          status: 'rejected',
          rejectionReason: `unknown decision: ${decision.decision}`,
          reviewedBy: 'orchestrator',
        };
    }
  }
}
```

Note: `status` in the schema is `contentPlanStatusEnum` which has values `planned | generating | review | approved | rejected | posted | failed`. The `#mapDecision` returns `approved | rejected | review` — all valid values.

- [ ] **Step 2.4: Run + commit**

```bash
pnpm --filter @advocate/app test orchestrator.service
pnpm lint
git add packages/app/src/orchestrator/ packages/app/tests/orchestrator/orchestrator.service.test.ts
git commit -m "feat(app): add OrchestratorService composing all 5 agents + content_plan persistence"
```

---

## Task 3: HTTP Route

**Files:**
- Create: `packages/app/src/server/routes/orchestrate.ts`
- Create: `packages/app/tests/orchestrator/orchestrate.http.test.ts`
- Modify: `packages/app/src/server/server.ts` — register the new route

- [ ] **Step 3.1: Implement route**

```typescript
// packages/app/src/server/routes/orchestrate.ts
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import type { LLMRouter } from '@advocate/engine';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { OrchestratorService } from '../../orchestrator/orchestrator.service.js';
import {
  OrchestratorNoAccountError,
  OrchestratorNoCommunitiesError,
  OrchestratorNoLegendsError,
} from '../../orchestrator/types.js';

export interface OrchestrateRoutesDeps {
  router: LLMRouter;
  logger: pino.Logger;
}

const draftSchema = z.object({
  productId: z.string().uuid(),
  campaignGoal: z.string().min(1),
  legendIds: z.array(z.string().uuid()).optional(),
  communityIds: z.array(z.string().uuid()).optional(),
  threadContext: z.string().optional(),
});

export async function registerOrchestrateRoutes(
  app: FastifyInstance,
  deps: OrchestrateRoutesDeps,
): Promise<void> {
  const orchestrator = new OrchestratorService({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  app.post('/orchestrate/draft', async (req, reply) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    try {
      const result = await orchestrator.draft(parsed.data);
      return reply.code(201).send(result);
    } catch (err) {
      if (
        err instanceof OrchestratorNoLegendsError ||
        err instanceof OrchestratorNoCommunitiesError ||
        err instanceof OrchestratorNoAccountError
      ) {
        return reply.code(422).send({ error: 'UnprocessableEntity', message: err.message });
      }
      if (err instanceof Error && /Product.*not found/i.test(err.message)) {
        return reply.code(404).send({ error: 'NotFound', message: err.message });
      }
      req.log.error({ err }, 'orchestrator draft failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });
}
```

- [ ] **Step 3.2: Register in `server.ts`**

```typescript
import { registerOrchestrateRoutes } from './routes/orchestrate.js';
// ... inside buildServer():
await registerOrchestrateRoutes(app, { router, logger });
```

- [ ] **Step 3.3: HTTP tests**

`orchestrate.http.test.ts` covers:
1. POST with invalid productId → 404
2. POST with valid product but no legends → 422
3. POST with missing fields → 400
4. (Optional) happy path with seeded data — keep simple because full fixture setup is heavy

The `orchestrator.service.test.ts` already proves the full happy/sad path; the HTTP test here can focus on validation + error mapping.

- [ ] **Step 3.4: Commit + push**

```bash
pnpm --filter @advocate/app test orchestrate
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/orchestrate.ts packages/app/src/server/server.ts packages/app/tests/orchestrator/orchestrate.http.test.ts
git commit -m "feat(app): add POST /orchestrate/draft endpoint (full pipeline trigger)"
git push origin master
```

---

## Task 4: Docker Round-Trip + Tag

- [ ] **Step 4.1: Boot stack + verify**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

- [ ] **Step 4.2: Tag + push**

```bash
git tag -a plan11d-complete -m "Plan 11d Orchestrator pipeline complete"
git push origin plan11d-complete
```

---

## Acceptance Criteria

1. ✅ `ContentPlanRepository` with 6 methods + integration tests
2. ✅ `OrchestratorService.draft(input)` composes Strategist → ContentWriter → QualityGate → SafetyWorker → CampaignLead and persists a content_plan row
3. ✅ Status mapping: post→approved, revise/reject→rejected, escalate→review, safety_blocked→rejected
4. ✅ qualityScore JSONB populated from QualityGate
5. ✅ `POST /orchestrate/draft` with 201/400/404/422 error codes
6. ✅ Total cost summed across all LLM calls in response
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan11d-complete` pushed

## Out of Scope

- **Human confirmation endpoint for escalated plans** → Plan 16 (Telegram) or later via dashboard
- **Automatic posting** after approval → Plan 11e + platform adapter integration
- **agent_messages table persistence** (logging inter-agent messages) → Plan 11e when BullMQ wiring provides natural hooks
- **Memory writes** (recording episodes for the chosen legend) → Plan 11e
- **Scout / Analytics Analyst agents** → separate plan
- **Auth on /orchestrate** → Plan 12

---

**End of Plan 11d (Orchestrator Pipeline).**
