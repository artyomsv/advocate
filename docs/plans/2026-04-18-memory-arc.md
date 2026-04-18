# Agent Memory Arc Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Turn agent memory from write-only bookkeeping into a working learning loop — scope raw episodes per product, distil generalisable lessons into shared consolidated memory, expose those lessons in the dashboard.

**Architecture:** Three moves, each independently shippable:
1. Scope `episodic_memories` + `relational_memories` to `products` with cascade; keep `consolidated_memories` global (intentionally shared across products).
2. New `MemoryConsolidator` agent + BullMQ daily cron that reads episodes across all products and extracts craft/community/safety lessons — rejecting product-specific signals by design.
3. `/lessons` dashboard page surfacing consolidated lessons with human-in-the-loop delete; optional orchestrator wiring to inject lessons into agent user prompts.

**Tech stack:** Existing — Drizzle, BullMQ, TelegramNotifier (for alerts), recharts (not needed), Fastify routes, React + @tanstack/react-query. New agent soul added to `/agents/config` editor. No new npm deps.

**Why this order:** Move 1 must land before Move 2 because the consolidator needs clean per-product episode sourcing. Move 3 is optional polish after the consolidator proves it produces useful lessons.

---

## Move 1 — Per-product episodic memory scoping

### Task 1.1: Schema migration

**Files:**
- Modify: `packages/app/src/db/schema/engine/memory.ts`
- Create: `packages/app/drizzle/migrations/NNNN_per_product_memories.sql` (via `pnpm db:generate`)
- Modify: `packages/app/src/db/schema/engine/memory.ts` imports

- [ ] **Step 1.1.1: Add productId column + FK to episodic_memories**

Edit `packages/app/src/db/schema/engine/memory.ts`:

```typescript
import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { products } from '../app/products.js';
import { agents } from './agents.js';
import { sentimentEnum } from './enums.js';

export const episodicMemories = pgTable(
  'episodic_memories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    lesson: text('lesson'),
    sentiment: sentimentEnum('sentiment').notNull().default('neutral'),
    context: jsonb('context'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('episodic_memories_agent_idx').on(t.agentId),
    productIdx: index('episodic_memories_product_idx').on(t.productId),
    agentProductCreatedIdx: index('episodic_memories_agent_product_created_idx').on(
      t.agentId,
      t.productId,
      t.createdAt,
    ),
  }),
);
```

- [ ] **Step 1.1.2: Add productId column to relational_memories**

Same pattern — productId uuid notNull FK products onDelete cascade, plus an index on `(agent_id, product_id, platform, external_username)`.

- [ ] **Step 1.1.3: Generate migration**

Run:
```bash
cd packages/app
DATABASE_URL="postgres://mynah:mynah@localhost:36432/mynah" pnpm db:generate
```

Expected: creates `drizzle/migrations/NNNN_xxx.sql` containing `ALTER TABLE episodic_memories ADD COLUMN product_id uuid`, FK constraint, indexes. Same for relational.

- [ ] **Step 1.1.4: Hand-edit the migration to backfill and hard-enforce**

The generated migration will fail because existing rows have NULL product_id and the column must be NOT NULL. Prepend these statements to the generated file:

```sql
-- Backfill from context jsonb (orchestrator was already tagging productId there)
UPDATE episodic_memories
SET product_id = (context->>'productId')::uuid
WHERE context->>'productId' IS NOT NULL
  AND EXISTS (SELECT 1 FROM products WHERE products.id = (context->>'productId')::uuid);

-- Delete orphans we can't associate (safer than keeping ambiguous rows)
DELETE FROM episodic_memories WHERE product_id IS NULL;

-- relational_memories has no product context today — truncate the few existing rows
DELETE FROM relational_memories;
```

Put these BEFORE the `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` statements drizzle generates.

- [ ] **Step 1.1.5: Apply migration**

```bash
cd packages/app
DATABASE_URL="postgres://mynah:mynah@localhost:36432/mynah" pnpm db:migrate
```

Verify:
```bash
docker exec mynah-postgres psql -U mynah -d mynah -c "\d episodic_memories"
```
Expected: `product_id | uuid | not null` with FK cascade.

- [ ] **Step 1.1.6: Commit**

```bash
git add packages/app/src/db/schema/engine/memory.ts packages/app/drizzle/migrations/
git commit -m "feat(memory): scope episodic + relational memories per product"
```

### Task 1.2: Update store + writers

**Files:**
- Modify: `packages/app/src/engine-stores/memory/drizzle-episodic-store.ts`
- Modify: `packages/app/src/engine-stores/memory/drizzle-relational-store.ts`
- Modify: `packages/engine/src/memory/types.ts` — add `productId` to `NewEpisode` + `Episode`

- [ ] **Step 1.2.1: Extend Episode + NewEpisode types in engine**

Edit `packages/engine/src/memory/types.ts`:

```typescript
export interface Episode {
  id: MemoryId;
  agentId: AgentId;
  productId: string;  // NEW
  action: string;
  outcome: string;
  lesson?: string;
  sentiment: Sentiment;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

export interface NewEpisode {
  agentId: AgentId;
  productId: string;  // NEW, required
  action: string;
  outcome: string;
  lesson?: string;
  sentiment?: Sentiment;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
```

- [ ] **Step 1.2.2: Extend EpisodicMemoryStore interface**

Same file — add optional productId filter to `getRecent` and `getBetween`:

```typescript
getRecent(agentId: AgentId, limit: number, opts?: { productId?: string }): Promise<readonly Episode[]>;
getBetween(agentId: AgentId, from: IsoTimestamp, to: IsoTimestamp, opts?: { productId?: string }): Promise<readonly Episode[]>;
```

- [ ] **Step 1.2.3: Implement in DrizzleEpisodicMemoryStore**

Edit `packages/app/src/engine-stores/memory/drizzle-episodic-store.ts`:

```typescript
async record(input: NewEpisode): Promise<Episode> {
  const [row] = await this.db
    .insert(episodicMemories)
    .values({
      agentId: input.agentId,
      productId: input.productId,
      action: input.action,
      outcome: input.outcome,
      lesson: input.lesson,
      sentiment: input.sentiment ?? 'neutral',
      context: input.context,
      metadata: input.metadata,
    })
    .returning();
  if (!row) throw new Error('episodic memory insert returned no row');
  return rowToEpisode(row);
}

async getRecent(
  agentId: AgentId,
  limit: number,
  opts: { productId?: string } = {},
): Promise<readonly Episode[]> {
  const conds = [eq(episodicMemories.agentId, agentId)];
  if (opts.productId) conds.push(eq(episodicMemories.productId, opts.productId));
  const rows = await this.db
    .select()
    .from(episodicMemories)
    .where(and(...conds))
    .orderBy(desc(episodicMemories.createdAt))
    .limit(limit);
  return rows.map(rowToEpisode);
}
```

Update `rowToEpisode` to include `productId: r.productId`.

- [ ] **Step 1.2.4: Same treatment for relational store**

Add productId to `NewRelationalMemory` and relational store's upsert/get methods.

- [ ] **Step 1.2.5: Update orchestrator memory calls**

Edit `packages/app/src/orchestrator/orchestrator.service.ts` — the `#recordEpisode` helper must include `productId`:

```typescript
async #recordEpisode(
  agentId: string,
  productId: string,
  action: string,
  outcome: string,
  sentiment: 'positive' | 'neutral' | 'negative',
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await this.#memory.record({
      agentId: agentId as AgentId,
      productId,
      action,
      outcome,
      sentiment,
      context,
    });
  } catch (err) {
    this.#deps.logger.warn({ err, agentId, action }, 'episodic memory write failed');
  }
}
```

Update every caller to pass `input.productId`.

- [ ] **Step 1.2.6: Update Scout memory write**

Edit `packages/app/src/agents/scout.ts` — the direct insert already has productId in context, hoist it to the column:

```typescript
await this.deps.db.insert(episodicMemories).values({
  agentId: '00000000-0000-4000-a000-000000000006',
  productId: input.productId,
  action: `Scanned r/${community.identifier} for ${product.name}`,
  outcome: `${threads.length} threads scored, ${dispatched} dispatched (threshold ${threshold.toFixed(1)})`,
  sentiment: dispatched > 0 ? 'positive' : 'neutral',
  context: {
    communityId: input.communityId,
    platform: community.platform,
  },
});
```

- [ ] **Step 1.2.7: Tests pass + commit**

```bash
cd packages/app && pnpm exec vitest run tests/engine-stores/memory.test.ts
cd .. && pnpm --filter @mynah/app typecheck
git add -A && git commit -m "feat(memory): wire productId through stores + orchestrator writes"
```

### Task 1.3: API filter + dashboard UI

**Files:**
- Modify: `packages/app/src/server/routes/visibility.ts`
- Modify: `packages/dashboard/src/routes/pages/Memory.tsx`

- [ ] **Step 1.3.1: Filter GET /agents/:agentId/memories by product**

Edit the memories route — accept `?productId=` and filter:

```typescript
app.get<{ Params: { agentId: string } }>(
  '/agents/:agentId/memories',
  { preHandler: [app.authenticate] },
  async (req) => {
    const uuid = kebabToUuid[req.params.agentId] ?? req.params.agentId;
    const productId = (req.query as { productId?: string }).productId;
    const conds = [eq(episodicMemories.agentId, uuid)];
    if (productId) conds.push(eq(episodicMemories.productId, productId));
    const [episodic, consolidated, relational] = await Promise.all([
      db.select().from(episodicMemories)
        .where(and(...conds))
        .orderBy(desc(episodicMemories.createdAt))
        .limit(50),
      db.select().from(consolidatedMemories)
        .where(eq(consolidatedMemories.agentId, uuid))
        .orderBy(desc(consolidatedMemories.consolidatedAt))
        .limit(20),
      db.select().from(relationalMemories)
        .where(productId
          ? and(eq(relationalMemories.agentId, uuid), eq(relationalMemories.productId, productId))
          : eq(relationalMemories.agentId, uuid))
        .orderBy(desc(relationalMemories.lastInteractionAt))
        .limit(50),
    ]);
    return { episodic, consolidated, relational };
  },
);
```

Note: `consolidated_memories` is intentionally NOT filtered — lessons are shared.

- [ ] **Step 1.3.2: Dashboard hook reads selected product**

Edit `packages/dashboard/src/routes/pages/Memory.tsx` — thread `useProductStore().selectedProductId` into the query:

```typescript
const productId = useProductStore((s) => s.selectedProductId);

const q = useQuery({
  queryKey: ['memories', agentId, productId],
  queryFn: () => {
    const qp = new URLSearchParams();
    if (productId) qp.set('productId', productId);
    return api<MemoryResponse>(
      `/agents/${agentId}/memories${qp.size ? `?${qp.toString()}` : ''}`,
      { token },
    );
  },
  enabled: !!token,
});
```

Add a small banner at the top of the page explaining:

> Raw episodic + relational memories are scoped to the selected product. Consolidated lessons are shared across all products by design.

- [ ] **Step 1.3.3: Typecheck + commit**

```bash
pnpm --filter @mynah/app typecheck && pnpm --filter @mynah/dashboard typecheck
git add -A && git commit -m "feat(dashboard): /memory scopes episodic + relational to selected product"
```

### Task 1.4: Verify move 1 end-to-end

- [ ] **Step 1.4.1: Rebuild + smoke**

```bash
docker compose up -d --build api worker dashboard
MYNAH_OWNER_PASS=owner pnpm smoke:e2e
```

Expected: smoke passes; new episodes land with product_id populated.

- [ ] **Step 1.4.2: Verify cascade**

```bash
docker exec mynah-postgres psql -U mynah -d mynah -c "SELECT count(*) FROM episodic_memories;"
# note count, then...
docker exec mynah-postgres psql -U mynah -d mynah -c "DELETE FROM products WHERE name='Smoke' RETURNING id;"
docker exec mynah-postgres psql -U mynah -d mynah -c "SELECT count(*) FROM episodic_memories;"
# count drops by whatever was attached to Smoke
```

- [ ] **Step 1.4.3: Tag**

```bash
git tag move1-per-product-memory
git push origin master && git push origin move1-per-product-memory
```

---

## Move 2 — Memory consolidator (shared lessons)

### Task 2.1: MemoryConsolidator agent

**Files:**
- Create: `packages/app/src/agents/memory-consolidator.ts`
- Modify: `packages/app/src/bootstrap/seed-agents.ts` — add consolidator to seed roster
- Modify: `packages/app/src/server/routes/agent-config.ts` — add roster entry so `/agents/config` shows it + allows soul editing

- [ ] **Step 2.1.1: Add consolidator seed UUID + roster entry**

Edit `seed-agents.ts`:

```typescript
export const SEED_AGENT_IDS = {
  campaignLead: '00000000-0000-4000-a000-000000000001',
  strategist: '00000000-0000-4000-a000-000000000002',
  contentWriter: '00000000-0000-4000-a000-000000000003',
  qualityGate: '00000000-0000-4000-a000-000000000004',
  safetyWorker: '00000000-0000-4000-a000-000000000005',
  scout: '00000000-0000-4000-a000-000000000006',
  analyticsAnalyst: '00000000-0000-4000-a000-000000000007',
  memoryConsolidator: '00000000-0000-4000-a000-000000000008',  // NEW
} as const;

const SPECS: readonly SeedAgentSpec[] = [
  // ... existing 7 ...
  {
    id: SEED_AGENT_IDS.memoryConsolidator,
    name: 'Memory Consolidator',
    role: 'memory_consolidator',
    soul: '',
  },
];
```

- [ ] **Step 2.1.2: Build the consolidator agent**

Create `packages/app/src/agents/memory-consolidator.ts`:

```typescript
import { and, desc, eq, gte } from 'drizzle-orm';
import { BaseAgent } from './base-agent.js';
import { resolveSoul } from './soul-loader.js';
import type { AgentDeps } from './types.js';
import { SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import { consolidatedMemories, episodicMemories } from '../db/schema.js';

export const MEMORY_CONSOLIDATOR_SYSTEM_PROMPT = `You consolidate agent run episodes into REUSABLE CRAFT LESSONS. You will receive a list of episodes from one agent across multiple products over a time window.

Your output is JSON: { "summary": "one-sentence period recap", "lessons": ["lesson 1", "lesson 2", ...] }

ACCEPT lessons about:
- Community norms (e.g. "r/cooking downvotes titles that read as ads")
- Content structure + tone (e.g. "posts under 800 chars outperform in r/frugal")
- Timing patterns (e.g. "09:00-11:00 EST scans produce 3x dispatches")
- Safety traps (e.g. "promo level >= 5 triggers mod removal in r/X")
- Quality calibration (e.g. "authenticity < 6 correlates with rejection")

REJECT lessons that are:
- Product-specific (mentioning product names, pain points, talking points)
- Legend-specific voice notes (those go in per-legend soul tuning)
- Competitor references
- Audience segment specifics ("moms of 4yr olds prefer X" — too narrow)

If you see no generalisable lessons, return { "summary": "...", "lessons": [] }. Do not invent lessons.`;

export interface ConsolidateInput {
  agentId: string;
  periodFrom: Date;
  periodTo: Date;
}

export interface ConsolidateResult {
  summary: string;
  lessons: string[];
  sourceEpisodeIds: string[];
  periodFrom: Date;
  periodTo: Date;
}

export class MemoryConsolidator extends BaseAgent {
  readonly name = 'memory-consolidator';

  constructor(deps: AgentDeps) {
    super(deps);
  }

  async consolidate(input: ConsolidateInput): Promise<ConsolidateResult | null> {
    // Pull episodes for this agent in the window — across ALL products.
    const episodes = await this.deps.db
      .select()
      .from(episodicMemories)
      .where(
        and(
          eq(episodicMemories.agentId, input.agentId),
          gte(episodicMemories.createdAt, input.periodFrom),
        ),
      )
      .orderBy(desc(episodicMemories.createdAt))
      .limit(200);

    if (episodes.length < 5) return null; // too few to generalise

    // Strip product-identifying context before feeding to the LLM —
    // defense in depth on top of the prompt guardrail.
    const sanitised = episodes.map((e) => ({
      action: e.action,
      outcome: e.outcome,
      sentiment: e.sentiment,
      // Keep only community + platform — strip productId + legendId.
      context: {
        communityId: (e.context as { communityId?: string } | null)?.communityId,
        platform: (e.context as { platform?: string } | null)?.platform,
      },
    }));

    const soul = await resolveSoul(
      this.deps.db,
      'memoryConsolidator',
      MEMORY_CONSOLIDATOR_SYSTEM_PROMPT,
    );

    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt: soul,
      userPrompt: `Episodes (newest first):\n\n${JSON.stringify(sanitised, null, 2)}`,
      responseFormat: 'json',
      maxTokens: 1024,
      temperature: 0.2,
    });

    let parsed: { summary?: string; lessons?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return null;
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const lessons = Array.isArray(parsed.lessons)
      ? parsed.lessons.filter((l): l is string => typeof l === 'string')
      : [];

    if (lessons.length === 0) return null;

    // Persist consolidated row.
    await this.deps.db.insert(consolidatedMemories).values({
      agentId: input.agentId,
      sourceEpisodeIds: episodes.map((e) => e.id),
      summary,
      lessons,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
    });

    return {
      summary,
      lessons,
      sourceEpisodeIds: episodes.map((e) => e.id),
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
    };
  }
}
```

- [ ] **Step 2.1.3: Export soul constant for agent-config route**

Edit `packages/app/src/server/routes/agent-config.ts` — add consolidator to the AGENTS array:

```typescript
import { MEMORY_CONSOLIDATOR_SYSTEM_PROMPT } from '../../agents/memory-consolidator.js';

const AGENTS: readonly AgentConfigEntry[] = [
  // ... existing 7 ...
  {
    agentId: 'memory-consolidator',
    name: 'Memory Consolidator',
    role: 'Distills craft lessons from raw episodes (daily)',
    taskType: 'classification',
    systemPrompt: MEMORY_CONSOLIDATOR_SYSTEM_PROMPT,
    dynamic: false,
  },
];

// Update KEBAB_TO_UUID:
const KEBAB_TO_UUID: Record<string, string> = {
  // ... existing ...
  'memory-consolidator': SEED_AGENT_IDS.memoryConsolidator,
};
```

- [ ] **Step 2.1.4: Typecheck + commit**

```bash
pnpm --filter @mynah/app typecheck
git add -A && git commit -m "feat(agents): MemoryConsolidator agent with craft-only soul"
```

### Task 2.2: Consolidator worker + cron

**Files:**
- Create: `packages/app/src/worker/memory-consolidator-worker.ts`
- Modify: `packages/app/src/worker/queues.ts` — add queue name + job data
- Modify: `packages/app/src/worker/worker.ts` — wire worker + cron

- [ ] **Step 2.2.1: Add queue name**

Edit `packages/app/src/worker/queues.ts`:

```typescript
export const QUEUE_NAMES = {
  // ... existing ...
  memoryConsolidate: 'memory.consolidate',
} as const;

export interface MemoryConsolidateJobData {
  _sentinel?: true;
}
```

- [ ] **Step 2.2.2: Create the worker**

Create `packages/app/src/worker/memory-consolidator-worker.ts`:

```typescript
import type { LLMRouter } from '@mynah/engine';
import { type Job, Worker } from 'bullmq';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import { MemoryConsolidator } from '../agents/memory-consolidator.js';
import { SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import type * as schema from '../db/schema.js';
import { notifyWorkerFailure } from '../notifications/failure-alerter.js';
import { type MemoryConsolidateJobData, QUEUE_NAMES } from './queues.js';

export interface MemoryConsolidatorWorkerDeps {
  connection: Redis;
  db: NodePgDatabase<typeof schema>;
  router: LLMRouter;
  logger: pino.Logger;
}

// Agents whose episodes we consolidate. safetyWorker skipped (no LLM output
// worth generalising). campaignLead + contentWriter + qualityGate + scout +
// strategist + analyticsAnalyst all in.
const CONSOLIDATE_AGENTS: readonly string[] = [
  SEED_AGENT_IDS.strategist,
  SEED_AGENT_IDS.contentWriter,
  SEED_AGENT_IDS.qualityGate,
  SEED_AGENT_IDS.campaignLead,
  SEED_AGENT_IDS.scout,
  SEED_AGENT_IDS.analyticsAnalyst,
];

export function createMemoryConsolidatorWorker(
  deps: MemoryConsolidatorWorkerDeps,
): Worker<MemoryConsolidateJobData> {
  const log = deps.logger.child({ component: 'memory-consolidator-worker' });
  const consolidator = new MemoryConsolidator({
    db: deps.db,
    router: deps.router,
    logger: deps.logger,
  });

  const worker = new Worker<MemoryConsolidateJobData>(
    QUEUE_NAMES.memoryConsolidate,
    async (_job: Job<MemoryConsolidateJobData>) => {
      const now = new Date();
      const windowStart = new Date(now.getTime() - 24 * 3600 * 1000);
      const results: Record<string, { lessons: number } | null> = {};

      for (const agentId of CONSOLIDATE_AGENTS) {
        try {
          const result = await consolidator.consolidate({
            agentId,
            periodFrom: windowStart,
            periodTo: now,
          });
          results[agentId] = result ? { lessons: result.lessons.length } : null;
        } catch (err) {
          log.warn({ err, agentId }, 'consolidation for agent failed');
          results[agentId] = null;
        }
      }

      log.info({ results }, 'memory consolidation sweep complete');
      return results;
    },
    { connection: deps.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'memory consolidate sweep failed');
    void notifyWorkerFailure({ worker: 'memory.consolidate', jobId: job?.id, err });
  });

  return worker;
}
```

- [ ] **Step 2.2.3: Wire cron in worker bootstrap**

Edit `packages/app/src/worker/worker.ts` — register queue + worker + cron at 04:00 UTC:

```typescript
// After daily summary block:
const consolidateQueue = new Queue<MemoryConsolidateJobData>(QUEUE_NAMES.memoryConsolidate, {
  connection: getRedis(),
});
const consolidatorWorker = createMemoryConsolidatorWorker({
  connection: getRedis(),
  db: getDb(),
  router,
  logger,
});
await consolidateQueue.upsertJobScheduler(
  'cron-memory-consolidate-04utc',
  { pattern: '0 4 * * *', tz: 'UTC' },
  {
    name: 'memory-consolidate',
    data: {},
    opts: { removeOnComplete: 30, removeOnFail: 30 },
  },
);
log.info('worker listening on queue: memory.consolidate (cron 04:00 UTC)');
```

Add to shutdown handler:
```typescript
await consolidatorWorker.close();
await consolidateQueue.close();
```

- [ ] **Step 2.2.4: Manual trigger endpoint for testing**

Add to `packages/app/src/server/routes/agent-config.ts`:

```typescript
app.post(
  '/memory/consolidate',
  { preHandler: [app.authenticate] },
  async (req, reply) => {
    const q = new Queue<MemoryConsolidateJobData>(QUEUE_NAMES.memoryConsolidate, {
      connection: getRedis(),
    });
    await q.add('memory-consolidate-manual', {}, { removeOnComplete: true });
    await q.close();
    return reply.code(202).send({ enqueued: true });
  },
);
```

- [ ] **Step 2.2.5: Rebuild + trigger + verify**

```bash
docker compose up -d --build api worker
# run a few orchestrator drafts to populate episodes, then:
curl -X POST http://localhost:36401/memory/consolidate \
  -H "Authorization: Bearer $TOKEN"
# wait a bit
docker exec mynah-postgres psql -U mynah -d mynah -c \
  "SELECT agent_id, summary, array_length(lessons::text[], 1) as n FROM consolidated_memories ORDER BY consolidated_at DESC LIMIT 5;"
```

Expected: at least one row with non-empty lessons.

- [ ] **Step 2.2.6: Commit + tag**

```bash
git add -A
git commit -m "feat(memory): consolidator worker + daily 04:00 UTC cron"
git tag move2-memory-consolidator
git push origin master && git push origin move2-memory-consolidator
```

---

## Move 3 — Lessons dashboard + optional agent injection

### Task 3.1: Backend /lessons route

**Files:**
- Modify: `packages/app/src/server/routes/visibility.ts` — add GET + DELETE

- [ ] **Step 3.1.1: Add GET /lessons**

```typescript
const lessonsQuery = z.object({
  agentId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

app.get('/lessons', { preHandler: [app.authenticate] }, async (req, reply) => {
  const parsed = lessonsQuery.safeParse(req.query);
  if (!parsed.success) {
    return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
  }
  const { agentId, limit } = parsed.data;
  const uuid = agentId ? (kebabToUuid[agentId] ?? agentId) : undefined;
  const conds = uuid ? [eq(consolidatedMemories.agentId, uuid)] : [];
  const q = db
    .select({
      id: consolidatedMemories.id,
      agentId: consolidatedMemories.agentId,
      sourceEpisodeIds: consolidatedMemories.sourceEpisodeIds,
      summary: consolidatedMemories.summary,
      lessons: consolidatedMemories.lessons,
      periodFrom: consolidatedMemories.periodFrom,
      periodTo: consolidatedMemories.periodTo,
      consolidatedAt: consolidatedMemories.consolidatedAt,
    })
    .from(consolidatedMemories);
  const rows = conds.length
    ? await q.where(and(...conds)).orderBy(desc(consolidatedMemories.consolidatedAt)).limit(limit)
    : await q.orderBy(desc(consolidatedMemories.consolidatedAt)).limit(limit);
  return rows;
});
```

- [ ] **Step 3.1.2: Add DELETE /lessons/:id**

```typescript
app.delete<{ Params: { id: string } }>(
  '/lessons/:id',
  { preHandler: [app.authenticate] },
  async (req, reply) => {
    const deleted = await db
      .delete(consolidatedMemories)
      .where(eq(consolidatedMemories.id, req.params.id))
      .returning({ id: consolidatedMemories.id });
    if (deleted.length === 0) {
      return reply.code(404).send({ error: 'NotFound' });
    }
    return reply.code(204).send();
  },
);
```

- [ ] **Step 3.1.3: Commit**

```bash
git add -A
git commit -m "feat(lessons): GET /lessons + DELETE /lessons/:id"
```

### Task 3.2: Dashboard /lessons page

**Files:**
- Create: `packages/dashboard/src/hooks/useLessons.ts`
- Create: `packages/dashboard/src/routes/pages/Lessons.tsx`
- Modify: `packages/dashboard/src/routes/router.tsx`
- Modify: `packages/dashboard/src/components/shell/Sidebar.tsx`

- [ ] **Step 3.2.1: useLessons hook**

```typescript
// packages/dashboard/src/hooks/useLessons.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface Lesson {
  id: string;
  agentId: string;
  sourceEpisodeIds: string[];
  summary: string;
  lessons: string[];
  periodFrom: string;
  periodTo: string;
  consolidatedAt: string;
}

export function useLessons(agentId?: string) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['lessons', agentId],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (agentId) qp.set('agentId', agentId);
      return api<Lesson[]>(`/lessons${qp.size ? `?${qp.toString()}` : ''}`, { token });
    },
    enabled: !!token,
  });
}

export function useDeleteLesson() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/lessons/${id}`, { method: 'DELETE', token, parseJson: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
  });
}
```

- [ ] **Step 3.2.2: Lessons page**

```typescript
// packages/dashboard/src/routes/pages/Lessons.tsx
import { Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Button } from '../../components/ui/button';
import { useDeleteLesson, useLessons } from '../../hooks/useLessons';

const AGENT_NAME: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'Campaign Lead',
  '00000000-0000-4000-a000-000000000002': 'Strategist',
  '00000000-0000-4000-a000-000000000003': 'Content Writer',
  '00000000-0000-4000-a000-000000000004': 'Quality Gate',
  '00000000-0000-4000-a000-000000000006': 'Scout',
  '00000000-0000-4000-a000-000000000007': 'Analytics Analyst',
  '00000000-0000-4000-a000-000000000008': 'Memory Consolidator',
};

export function Lessons(): JSX.Element {
  const [filter, setFilter] = useState<string>('all');
  const q = useLessons(filter === 'all' ? undefined : filter);
  const del = useDeleteLesson();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Lessons</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Craft + community patterns the Memory Consolidator distilled from agent runs.
          Shared across all products. Delete any lesson that looks wrong — human in the loop.
        </p>
      </div>

      <div className="glass inline-flex flex-wrap gap-0.5 p-0.5">
        {['all', ...Object.keys(AGENT_NAME)].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={
              filter === k
                ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }
          >
            {k === 'all' ? 'All' : AGENT_NAME[k] ?? k.slice(0, 8)}
          </button>
        ))}
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No lessons yet. The consolidator runs daily at 04:00 UTC — or trigger it manually
          via <code>POST /memory/consolidate</code>.
        </div>
      )}
      {q.data && q.data.map((l) => (
        <div key={l.id} className="glass p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{AGENT_NAME[l.agentId] ?? l.agentId.slice(0, 8)}</div>
              <div className="text-xs text-[var(--fg-subtle)]">
                {new Date(l.periodFrom).toLocaleDateString()} – {new Date(l.periodTo).toLocaleDateString()}
                {' · '}
                consolidated {new Date(l.consolidatedAt).toLocaleString()}
                {' · '}
                {l.sourceEpisodeIds.length} source episode{l.sourceEpisodeIds.length === 1 ? '' : 's'}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm('Delete this lesson? The orchestrator will stop injecting it into future runs.')) {
                  del.mutate(l.id);
                }
              }}
            >
              <Trash2 size={14} />
            </Button>
          </div>
          <div className="mt-2 text-sm">{l.summary}</div>
          <ul className="mt-2 space-y-1 text-sm text-[var(--fg-muted)]">
            {l.lessons.map((lesson, i) => (
              <li key={i}>· {lesson}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3.2.3: Wire route + sidebar**

Add to `router.tsx`:
```typescript
import { Lessons } from './pages/Lessons';
// ...
{ path: 'lessons', element: <Lessons /> },
```

Add to `Sidebar.tsx`:
```typescript
import { GraduationCap } from 'lucide-react';
// ...
{ to: '/lessons', label: 'Lessons', icon: GraduationCap },
// place between /memory and /tasks
```

- [ ] **Step 3.2.4: Typecheck + commit**

```bash
pnpm --filter @mynah/dashboard typecheck
git add -A && git commit -m "feat(dashboard): /lessons page with delete + agent filter"
```

### Task 3.3: Inject lessons into agent prompts (OPTIONAL)

This closes the loop — consolidated lessons get read back into agent runs.

**Files:**
- Modify: `packages/app/src/agents/strategist.ts`, `content-writer.ts`, `quality-gate.ts`, `campaign-lead.ts`, `scout.ts`
- Create: `packages/app/src/agents/lessons-loader.ts`

- [ ] **Step 3.3.1: Create lessons loader with short cache**

```typescript
// packages/app/src/agents/lessons-loader.ts
import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { consolidatedMemories } from '../db/schema.js';

const TTL_MS = 5 * 60 * 1000; // 5-minute cache — lessons change slowly

interface CacheEntry {
  lessons: string[];
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function loadLessons(
  db: NodePgDatabase<typeof schema>,
  agentId: string,
  max = 15,
): Promise<string[]> {
  const now = Date.now();
  const cached = cache.get(agentId);
  if (cached && now - cached.loadedAt < TTL_MS) return cached.lessons;

  try {
    const rows = await db
      .select({ lessons: consolidatedMemories.lessons })
      .from(consolidatedMemories)
      .where(eq(consolidatedMemories.agentId, agentId))
      .orderBy(desc(consolidatedMemories.consolidatedAt))
      .limit(5);
    const flat = rows.flatMap((r) => r.lessons).slice(0, max);
    cache.set(agentId, { lessons: flat, loadedAt: now });
    return flat;
  } catch {
    return [];
  }
}

export function formatLessons(lessons: readonly string[]): string {
  if (lessons.length === 0) return '';
  return (
    '\n\nLESSONS FROM PAST RUNS (shared across products — these are craft observations, not product specifics):\n' +
    lessons.map((l) => `- ${l}`).join('\n')
  );
}
```

- [ ] **Step 3.3.2: Append lessons to each agent's user prompt**

In `strategist.ts`, before building the final prompt:

```typescript
const lessons = await loadLessons(this.deps.db, SEED_AGENT_IDS.strategist);
const userPrompt = baseUserPrompt + formatLessons(lessons);
```

Repeat for content-writer, quality-gate, campaign-lead, scout. The system prompt (soul) stays clean — lessons go in the user prompt so they don't get prompt-cached.

- [ ] **Step 3.3.3: Commit + tag arc complete**

```bash
git add -A && git commit -m "feat(agents): inject shared lessons into agent user prompts"
git tag move3-lessons-dashboard
git push origin master && git push origin move3-lessons-dashboard
```

---

## Verification checklist (across all 3 moves)

- [ ] Every draft writes episodes with `product_id` populated (not null)
- [ ] Deleting a product cascades to its episodic + relational memories
- [ ] `consolidated_memories` is NOT product-scoped — one row per agent per window
- [ ] Consolidator daily cron is registered (check worker logs)
- [ ] Manual `POST /memory/consolidate` produces at least one row after 5+ episodes exist
- [ ] `/lessons` page renders cards, filter-by-agent works, delete works
- [ ] Lessons get injected into agent prompts (if Task 3.3 done) — verify via reading `agent_messages.content` and seeing the "LESSONS FROM PAST RUNS" section
- [ ] Consolidator's sanitisation strips `productId` + `legendId` from context before sending to LLM
- [ ] Typecheck + vitest green

---

## Effort estimate

| Move | Effort | Critical path |
|---|---|---|
| Move 1 (per-product episodes) | ~2h | schema → store → writers → UI |
| Move 2 (consolidator + cron) | ~4h | agent → worker → cron → verify |
| Move 3 (lessons dashboard) | ~2-3h | routes → page → optional injection |
| **Total** | **~8-9h** | |

Move 1 is non-negotiable. Moves 2 + 3 are valuable but independently shippable.
