# BullMQ Autonomy Implementation Plan (Plan 11e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace "human types curl" with "cron fires autonomously." Ship a concrete BullMQ-backed `HeartbeatScheduler` implementation, a separate worker process that listens to the queue and runs the orchestrator on schedule, a new `worker` service in docker-compose, and HTTP endpoints to manage schedules. After this plan, you can POST a cron-pattern schedule and walk away — the system drafts content on its own.

**Architecture:** Two processes. **API** (existing) handles HTTP; the new **worker** process connects to the same Redis and consumes scheduled jobs. BullMQ's `upsertJobScheduler` persists cron patterns in Redis — no DB table needed. When a scheduled tick fires, the worker's queue consumer runs `OrchestratorService.draft(params)` and persists a `content_plan` row exactly as the manual `/orchestrate/draft` endpoint does.

**Tech Stack:** BullMQ 5 (already installed) · ioredis (installed) · docker-compose (existing)

**Prerequisites:**
- Plan 11d complete (tag `plan11d-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/app/src/heartbeat/
├── index.ts
└── bullmq-scheduler.ts              # BullMQHeartbeatScheduler (concrete impl)

packages/app/src/worker/
├── index.ts                         # re-exports
├── queues.ts                        # Queue definitions + names
├── orchestrate-worker.ts            # Worker handler for orchestrate.draft jobs
└── worker.ts                        # Entry point — starts the worker process

packages/app/src/server/routes/
└── schedules.ts                     # POST/GET/DELETE schedules via BullMQ

packages/app/tests/heartbeat/
└── bullmq-scheduler.test.ts         # Integration against real Redis

packages/app/Dockerfile               # (modify) — add `worker` stage
docker-compose.yml                    # (modify) — add `worker` service
```

## Design decisions

1. **Two processes, one image.** Both API and worker share the same built `dist/` folder. Dockerfile's `runtime` stage stays unchanged; we add a single-purpose `worker` target whose CMD runs `node packages/app/dist/worker/worker.js` instead of the server.

2. **BullMQ `upsertJobScheduler` is the source of truth for cron.** No `heartbeat_schedules` DB writes in this plan. The trade-off: schedules live in Redis. Losing Redis = losing schedules. Acceptable at this stage; a persistent mirror can be added later.

3. **Queue name: `orchestrate`.** One queue for orchestration jobs. Future queues (e.g., `scout`, `analytics`) follow the same pattern.

4. **Worker runs orchestrator directly.** When a job fires, the worker instantiates `OrchestratorService` and calls `draft()` with the job payload. Same code path as the HTTP route.

5. **Schedules are parameterized.** `POST /schedules/orchestrate` takes `{ name, cronPattern, productId, campaignGoal, legendIds?, communityIds? }`. BullMQ stores the pattern + data together.

6. **No job retries in this plan.** Default BullMQ retry = 0. If the orchestrator throws, the job is marked failed and logged. Retry/backoff is easy to add later but not critical for the MVP autonomy demo.

---

## Task 1: Queue Definitions + BullMQHeartbeatScheduler

**Files:**
- Create: `packages/app/src/worker/queues.ts`
- Create: `packages/app/src/heartbeat/bullmq-scheduler.ts`
- Create: `packages/app/tests/heartbeat/bullmq-scheduler.test.ts`

- [ ] **Step 1.1: Create `packages/app/src/worker/queues.ts`**

```typescript
/**
 * Queue names shared between the API (which enqueues) and the worker
 * (which consumes). Keep in sync with package/app/src/worker/worker.ts.
 */
export const QUEUE_NAMES = {
  orchestrate: 'orchestrate',
} as const;

/**
 * Job data shape for the `orchestrate` queue.
 * Same shape as DraftOrchestrationInput in orchestrator/types.ts, kept
 * here so worker code doesn't have to import orchestrator-specific types
 * at the queue layer.
 */
export interface OrchestrateJobData {
  productId: string;
  campaignGoal: string;
  legendIds?: readonly string[];
  communityIds?: readonly string[];
  threadContext?: string;
  /** Optional label so logs/traces can correlate recurring runs. */
  scheduleName?: string;
}
```

- [ ] **Step 1.2: Write failing test FIRST**

Create `packages/app/tests/heartbeat/bullmq-scheduler.test.ts`:

```typescript
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';
import type { AgentId } from '@advocate/engine';
import { getRedis, closeRedis } from '../../src/queue/connection.js';
import { BullMQHeartbeatScheduler } from '../../src/heartbeat/bullmq-scheduler.js';

const TEST_QUEUE = 'heartbeat-test-queue';

describe('BullMQHeartbeatScheduler (integration)', () => {
  let queue: Queue;
  let scheduler: BullMQHeartbeatScheduler;

  beforeAll(async () => {
    const connection = getRedis();
    queue = new Queue(TEST_QUEUE, { connection });
    scheduler = new BullMQHeartbeatScheduler(getRedis());
  });

  afterAll(async () => {
    await queue.drain();
    await queue.obliterate({ force: true });
    await queue.close();
    await closeRedis();
  });

  afterEach(async () => {
    // Clean up schedulers across all tests
    const keys = await getRedis().keys('bull:*');
    if (keys.length > 0) await getRedis().del(keys);
  });

  it('registerCron creates a schedule with id + createdAt + enabled', async () => {
    const schedule = await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'test-cron',
      queueName: TEST_QUEUE,
      cronPattern: '*/5 * * * *',
      jobType: 'test.poll',
      jobData: { x: 1 },
    });
    expect(schedule.id).toMatch(/.+/);
    expect(schedule.enabled).toBe(true);
    expect(schedule.cronPattern).toBe('*/5 * * * *');
  });

  it('listSchedules returns all schedules for the queue', async () => {
    await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'a',
      queueName: TEST_QUEUE,
      cronPattern: '0 * * * *',
      jobType: 'j1',
    });
    await scheduler.registerCron({
      agentId: '22222222-2222-4222-8222-222222222222' as AgentId,
      name: 'b',
      queueName: TEST_QUEUE,
      cronPattern: '0 0 * * *',
      jobType: 'j2',
    });
    const list = await scheduler.listSchedules(TEST_QUEUE);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('unregisterCron removes a schedule', async () => {
    const s = await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'to-remove',
      queueName: TEST_QUEUE,
      cronPattern: '* * * * *',
      jobType: 'j',
    });
    expect(await scheduler.unregisterCron(TEST_QUEUE, s.id)).toBe(true);
    // Unregistering again should be a no-op, returning false.
    expect(await scheduler.unregisterCron(TEST_QUEUE, s.id)).toBe(false);
  });

  it('rejects empty cron pattern', async () => {
    await expect(
      scheduler.registerCron({
        agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
        name: 'x',
        queueName: TEST_QUEUE,
        cronPattern: '',
        jobType: 'j',
      }),
    ).rejects.toThrow(/cronPattern/i);
  });
});
```

- [ ] **Step 1.3: Run — MUST FAIL**

```bash
cd E:/Projects/Stukans/advocate
mkdir -p packages/app/tests/heartbeat
pnpm --filter @advocate/app test bullmq-scheduler
```

- [ ] **Step 1.4: Implement `packages/app/src/heartbeat/bullmq-scheduler.ts`**

```typescript
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AgentId, IsoTimestamp, Schedule } from '@advocate/engine';
import { childLogger } from '../config/logger.js';

const log = childLogger('heartbeat.bullmq');

export interface RegisterCronInput {
  agentId: AgentId;
  name: string;
  queueName: string;
  cronPattern: string;
  jobType: string;
  jobData?: Record<string, unknown>;
}

export class BullMQHeartbeatScheduler {
  readonly #connection: Redis;
  readonly #queues = new Map<string, Queue>();

  constructor(connection: Redis) {
    this.#connection = connection;
  }

  async registerCron(input: RegisterCronInput): Promise<Schedule> {
    if (input.cronPattern.trim().length === 0) {
      throw new Error('cronPattern must be non-empty');
    }
    const queue = this.#getQueue(input.queueName);

    // BullMQ job-scheduler ID uniquely identifies a recurring schedule.
    // Using `${agentId}:${name}` gives us a deterministic key for idempotent re-registration.
    const id = `${input.agentId}:${input.name}`;
    await queue.upsertJobScheduler(
      id,
      { pattern: input.cronPattern },
      {
        name: input.jobType,
        data: { ...input.jobData, scheduleName: input.name },
      },
    );

    log.info({ id, pattern: input.cronPattern, queue: input.queueName }, 'scheduled cron');

    const now = new Date().toISOString() as IsoTimestamp;
    return {
      id,
      agentId: input.agentId,
      name: input.name,
      cronPattern: input.cronPattern,
      jobType: input.jobType,
      jobData: input.jobData,
      enabled: true,
      createdAt: now,
    };
  }

  async unregisterCron(queueName: string, scheduleId: string): Promise<boolean> {
    const queue = this.#getQueue(queueName);
    return queue.removeJobScheduler(scheduleId);
  }

  async listSchedules(queueName: string): Promise<readonly Schedule[]> {
    const queue = this.#getQueue(queueName);
    const schedulers = await queue.getJobSchedulers();
    return schedulers.map((s) => {
      const [agentId, ...rest] = s.key.split(':');
      return {
        id: s.key,
        agentId: (agentId ?? '') as AgentId,
        name: rest.join(':'),
        cronPattern: s.pattern ?? '',
        jobType: s.name ?? '',
        jobData: s.data as Record<string, unknown> | undefined,
        enabled: true,
        createdAt: new Date(s.next ?? Date.now()).toISOString() as IsoTimestamp,
        nextRunAt: s.next ? (new Date(s.next).toISOString() as IsoTimestamp) : undefined,
      };
    });
  }

  async close(): Promise<void> {
    for (const queue of this.#queues.values()) {
      await queue.close();
    }
    this.#queues.clear();
  }

  #getQueue(name: string): Queue {
    let queue = this.#queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.#connection });
      this.#queues.set(name, queue);
    }
    return queue;
  }
}
```

- [ ] **Step 1.5: Create barrel**

`packages/app/src/heartbeat/index.ts`:

```typescript
export * from './bullmq-scheduler.js';
```

- [ ] **Step 1.6: Run test + commit**

Ensure Redis is up: `docker compose up -d postgres redis`.

```bash
pnpm --filter @advocate/app test bullmq-scheduler
pnpm lint
git add packages/app/src/heartbeat/ packages/app/src/worker/queues.ts packages/app/tests/heartbeat/
git commit -m "feat(app): add BullMQHeartbeatScheduler (concrete heartbeat scheduler via Redis)"
```

---

## Task 2: Worker Entry Point

**Files:**
- Create: `packages/app/src/worker/orchestrate-worker.ts`
- Create: `packages/app/src/worker/worker.ts`
- Create: `packages/app/src/worker/index.ts`

- [ ] **Step 2.1: Create `packages/app/src/worker/orchestrate-worker.ts`**

```typescript
import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import type { LLMRouter } from '@advocate/engine';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { OrchestratorService } from '../orchestrator/orchestrator.service.js';
import type { OrchestrateJobData } from './queues.js';
import { QUEUE_NAMES } from './queues.js';

export interface OrchestrateWorkerDeps {
  connection: Redis;
  router: LLMRouter;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
}

export function createOrchestrateWorker(deps: OrchestrateWorkerDeps): Worker {
  const orchestrator = new OrchestratorService({
    router: deps.router,
    db: deps.db,
    logger: deps.logger,
  });
  const log = deps.logger.child({ component: 'orchestrate-worker' });

  const worker = new Worker<OrchestrateJobData>(
    QUEUE_NAMES.orchestrate,
    async (job: Job<OrchestrateJobData>) => {
      log.info(
        { jobId: job.id, scheduleName: job.data.scheduleName, productId: job.data.productId },
        'orchestrate job firing',
      );
      const result = await orchestrator.draft({
        productId: job.data.productId,
        campaignGoal: job.data.campaignGoal,
        legendIds: job.data.legendIds,
        communityIds: job.data.communityIds,
        threadContext: job.data.threadContext,
      });
      log.info(
        {
          jobId: job.id,
          contentPlanId: result.contentPlan.id,
          status: result.contentPlan.status,
          totalCostMillicents: result.totalCostMillicents,
        },
        'orchestrate job complete',
      );
      return {
        contentPlanId: result.contentPlan.id,
        status: result.contentPlan.status,
        totalCostMillicents: result.totalCostMillicents,
      };
    },
    {
      connection: deps.connection,
      concurrency: 2,
    },
  );

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, err, scheduleName: job?.data.scheduleName },
      'orchestrate job failed',
    );
  });

  return worker;
}
```

- [ ] **Step 2.2: Create `packages/app/src/worker/worker.ts`**

```typescript
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getDb, closeDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis, getRedis } from '../queue/connection.js';
import { createOrchestrateWorker } from './orchestrate-worker.js';

/**
 * Worker process entry. Connects to Redis, wires the orchestrator worker,
 * runs until SIGTERM.
 */
async function start(): Promise<void> {
  const env = getEnv();
  const log = logger.child({ component: 'worker-main' });

  log.info({ env: env.NODE_ENV }, 'worker starting');

  const { router, activeProviders } = createDefaultRouter({ env });
  log.info({ activeProviders }, 'llm router built');

  const worker = createOrchestrateWorker({
    connection: getRedis(),
    router,
    db: getDb(),
    logger,
  });

  log.info('worker listening on queue: orchestrate');

  const shutdown = async (signal: string) => {
    log.info({ signal }, 'shutting down');
    await worker.close();
    await closeDb();
    await closeRedis();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start().catch((err) => {
    logger.error({ err }, 'worker failed to start');
    process.exit(1);
  });
}

export { start };
```

- [ ] **Step 2.3: Create `packages/app/src/worker/index.ts`**

```typescript
export * from './orchestrate-worker.js';
export * from './queues.js';
```

- [ ] **Step 2.4: Typecheck + commit**

```bash
pnpm --filter @advocate/app typecheck
pnpm lint
git add packages/app/src/worker/
git commit -m "feat(app): add BullMQ worker process + orchestrate job handler"
```

---

## Task 3: Docker Worker Service

**Files:**
- Modify: `packages/app/Dockerfile` — add a `worker` final target
- Modify: `docker-compose.yml` — add `worker` service

- [ ] **Step 3.1: Update `packages/app/Dockerfile`**

Add a new stage at the end of the file, after the existing `runtime` stage:

```dockerfile
# ============================================
# Stage 4 — worker: same runtime, different CMD
# ============================================
FROM runtime AS worker
CMD ["node", "packages/app/dist/worker/worker.js"]
```

This piggybacks on the `runtime` stage — same deps, same code, different entry point. Shares the same built layers.

- [ ] **Step 3.2: Add `worker` service to `docker-compose.yml`**

After the existing `api` service block, add:

```yaml
  worker:
    build:
      context: .
      dockerfile: packages/app/Dockerfile
      target: worker
    container_name: advocate-worker
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      # Same env as api (duplicated to keep services independent)
      NODE_ENV: production
      RUNNING_IN_CONTAINER: "true"
      DATABASE_URL: postgresql://advocate:advocate@postgres:5432/advocate
      REDIS_URL: redis://redis:6379
      ANTHROPIC_API_KEY: "${ANTHROPIC_API_KEY:-}"
      GOOGLE_AI_API_KEY: "${GOOGLE_AI_API_KEY:-}"
      OPENAI_API_KEY: "${OPENAI_API_KEY:-}"
      DEEPSEEK_API_KEY: "${DEEPSEEK_API_KEY:-}"
      QWEN_API_KEY: "${QWEN_API_KEY:-}"
      LLM_MONTHLY_BUDGET_CENTS: "${LLM_MONTHLY_BUDGET_CENTS:-2000}"
      LLM_DEFAULT_MODE: "${LLM_DEFAULT_MODE:-balanced}"
      KEYCLOAK_URL: "${KEYCLOAK_URL:-http://host.docker.internal:9080}"
      KEYCLOAK_REALM: "${KEYCLOAK_REALM:-advocate}"
      KEYCLOAK_CLIENT_ID: "${KEYCLOAK_CLIENT_ID:-advocate-app}"
      TELEGRAM_BOT_TOKEN: "${TELEGRAM_BOT_TOKEN:-}"
      TELEGRAM_CHANNEL_ID: "${TELEGRAM_CHANNEL_ID:-}"
      CREDENTIAL_MASTER_KEY: "${CREDENTIAL_MASTER_KEY}"
      LOG_LEVEL: "${LOG_LEVEL:-info}"
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

- [ ] **Step 3.3: Commit**

```bash
git add packages/app/Dockerfile docker-compose.yml
git commit -m "feat: add worker service to Docker Compose (BullMQ consumer)"
```

---

## Task 4: Schedule Management Routes

**Files:**
- Create: `packages/app/src/server/routes/schedules.ts`
- Modify: `packages/app/src/server/server.ts` — register the route

- [ ] **Step 4.1: Create `packages/app/src/server/routes/schedules.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import type { AgentId } from '@advocate/engine';
import { BullMQHeartbeatScheduler } from '../../heartbeat/bullmq-scheduler.js';
import { getRedis } from '../../queue/connection.js';
import { QUEUE_NAMES } from '../../worker/queues.js';

export interface ScheduleRoutesDeps {
  logger: pino.Logger;
}

const registerSchema = z.object({
  /** Human-readable schedule name (unique per agent). */
  name: z.string().min(1),
  /** Crontab-style pattern. */
  cronPattern: z.string().min(1),
  productId: z.string().uuid(),
  campaignGoal: z.string().min(1),
  legendIds: z.array(z.string().uuid()).optional(),
  communityIds: z.array(z.string().uuid()).optional(),
  threadContext: z.string().optional(),
  /** The conceptual agent that owns this schedule — Campaign Lead by default. */
  agentId: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
});

export async function registerScheduleRoutes(
  app: FastifyInstance,
  deps: ScheduleRoutesDeps,
): Promise<void> {
  const scheduler = new BullMQHeartbeatScheduler(getRedis());

  app.post('/schedules/orchestrate', async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
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
      const schedule = await scheduler.registerCron({
        agentId: parsed.data.agentId as AgentId,
        name: parsed.data.name,
        queueName: QUEUE_NAMES.orchestrate,
        cronPattern: parsed.data.cronPattern,
        jobType: 'orchestrate.draft',
        jobData: {
          productId: parsed.data.productId,
          campaignGoal: parsed.data.campaignGoal,
          legendIds: parsed.data.legendIds,
          communityIds: parsed.data.communityIds,
          threadContext: parsed.data.threadContext,
        },
      });
      return reply.code(201).send(schedule);
    } catch (err) {
      req.log.error({ err }, 'schedule register failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });

  app.get('/schedules/orchestrate', async () => {
    return scheduler.listSchedules(QUEUE_NAMES.orchestrate);
  });

  app.delete<{ Params: { id: string } }>('/schedules/orchestrate/:id', async (req, reply) => {
    const removed = await scheduler.unregisterCron(QUEUE_NAMES.orchestrate, req.params.id);
    if (!removed) {
      return reply.code(404).send({ error: 'NotFound', id: req.params.id });
    }
    return reply.code(204).send();
  });
}
```

- [ ] **Step 4.2: Register in `server.ts`**

```typescript
import { registerScheduleRoutes } from './routes/schedules.js';
// ... inside buildServer() after the existing routes:
await registerScheduleRoutes(app, { logger });
```

- [ ] **Step 4.3: Commit + push**

```bash
pnpm --filter @advocate/app typecheck
pnpm lint
git add packages/app/src/server/routes/schedules.ts packages/app/src/server/server.ts
git commit -m "feat(app): add /schedules/orchestrate routes (BullMQ-backed cron management)"
git push origin master
```

---

## Task 5: Docker Round-Trip + Demo

- [ ] **Step 5.1: Rebuild full stack with worker**

```bash
docker compose down
docker compose up -d --build
```

Expected: 4 containers now (postgres + redis + api + worker). Wait for api to be healthy. The worker doesn't have a healthcheck in this plan (optional later); verify via logs.

- [ ] **Step 5.2: Verify worker is listening**

```bash
docker compose logs worker | grep "worker listening"
```

Expected: one line like `"worker listening on queue: orchestrate"`.

- [ ] **Step 5.3: Register an "every minute" schedule for demo**

Seed product + legend + account + community as in Plan 11d smoke test. Then:

```bash
curl -X POST http://localhost:36401/schedules/orchestrate \
  -H 'Content-Type: application/json' \
  -d '{"name":"dave-hourly-demo","cronPattern":"*/1 * * * *","productId":"<product-uuid>","campaignGoal":"build trust in r/Plumbing","legendIds":["<legend-uuid>"],"communityIds":["<community-uuid>"]}'
```

Wait 60 seconds. Check worker logs:

```bash
docker compose logs worker --tail 30 | grep orchestrate
```

Expected: `"orchestrate job firing"` followed shortly by `"orchestrate job complete"` with a content_plan id.

Query the DB to confirm the content_plan was created:

```bash
docker exec advocate-postgres psql -U advocate -d advocate -c \
  "SELECT id, status, content_type, promotion_level, created_at FROM content_plans ORDER BY created_at DESC LIMIT 3;"
```

- [ ] **Step 5.4: Unregister the schedule + cleanup**

```bash
curl -X DELETE "http://localhost:36401/schedules/orchestrate/<schedule-id>"
curl -X DELETE "http://localhost:36401/legends/<legend-uuid>"
curl -X DELETE "http://localhost:36401/products/<product-uuid>"
docker compose down
```

- [ ] **Step 5.5: Tag + push**

```bash
git tag -a plan11e-complete -m "Plan 11e BullMQ autonomy complete: scheduled orchestration via worker"
git push origin plan11e-complete
```

---

## Acceptance Criteria

1. ✅ `BullMQHeartbeatScheduler` implements registerCron / listSchedules / unregisterCron against real Redis
2. ✅ `createOrchestrateWorker` starts a BullMQ worker that consumes the `orchestrate` queue and calls `OrchestratorService.draft`
3. ✅ Worker entry point (`worker.ts`) wires deps + signal handlers
4. ✅ New Dockerfile `worker` stage + docker-compose `worker` service
5. ✅ `POST /schedules/orchestrate` + `GET` + `DELETE /schedules/orchestrate/:id` endpoints
6. ✅ Demo: registering an `*/1 * * * *` schedule produces content_plan rows autonomously every minute
7. ✅ Tag `plan11e-complete` pushed

## Out of Scope

- **Persistent schedule mirror in DB** (heartbeat_schedules table) — schedules live in Redis only for this plan
- **Retries / backoff** — default BullMQ retry is 0; add later if needed
- **Bull Board** (queue UI) — separate plan when debugging becomes important
- **Worker healthchecks** in Docker Compose — add when running in production
- **Multi-queue setup** (scout, analytics) — add those queues when those agents need autonomy

---

**End of Plan 11e (BullMQ Autonomy).**
