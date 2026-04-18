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

// Agents whose episodes we consolidate daily. safetyWorker is rules-based
// (no LLM output worth generalising). The consolidator itself isn't in the
// list — it doesn't write episodes.
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
