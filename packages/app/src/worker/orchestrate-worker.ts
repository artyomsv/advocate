import type { LLMRouter } from '@mynah/engine';
import { type Job, Worker } from 'bullmq';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import type * as schema from '../db/schema.js';
import { OrchestratorService } from '../orchestrator/orchestrator.service.js';
import { type OrchestrateJobData, QUEUE_NAMES } from './queues.js';

export interface OrchestrateWorkerDeps {
  connection: Redis;
  router: LLMRouter;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
}

export function createOrchestrateWorker(deps: OrchestrateWorkerDeps): Worker<OrchestrateJobData> {
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
