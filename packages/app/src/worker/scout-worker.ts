import { type Job, Queue, Worker } from 'bullmq';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import type { LLMRouter } from '@mynah/engine';
import { Scout } from '../agents/scout.js';
import type * as schema from '../db/schema.js';
import { RedditClient } from '../reddit/client.js';
import type { RedditAppConfig } from '../reddit/oauth.js';
import { RedditTokenStore } from '../reddit/tokens.js';
import { type OrchestrateJobData, QUEUE_NAMES, type ScoutScanJobData } from './queues.js';

export interface ScoutWorkerDeps {
  connection: Redis;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
  router: LLMRouter;
  redditConfig: RedditAppConfig;
  masterKey: string;
}

export function createScoutWorker(deps: ScoutWorkerDeps): Worker<ScoutScanJobData> {
  const log = deps.logger.child({ component: 'scout-worker' });
  const reddit = new RedditClient(
    deps.redditConfig,
    new RedditTokenStore(deps.db, deps.masterKey),
  );
  const scout = new Scout({ router: deps.router, db: deps.db, logger: deps.logger }, reddit);
  const orchestrateQueue = new Queue<OrchestrateJobData>(QUEUE_NAMES.orchestrate, {
    connection: deps.connection,
  });

  const worker = new Worker<ScoutScanJobData>(
    QUEUE_NAMES.scoutScan,
    async (job: Job<ScoutScanJobData>) => {
      log.info(
        { productId: job.data.productId, communityId: job.data.communityId },
        'scout scan firing',
      );

      const result = await scout.scanAndDispatch(
        {
          productId: job.data.productId,
          communityId: job.data.communityId,
          threshold: job.data.threshold,
          fetchLimit: job.data.fetchLimit,
        },
        async (params) => {
          await orchestrateQueue.add('draft', {
            productId: params.productId,
            campaignGoal: job.data.campaignGoal ?? 'Engage with promising threads surfaced by Scout',
            legendIds: [params.legendId],
            communityIds: [params.communityId],
            threadContext: params.threadContext,
            scheduleName: 'scout-dispatch',
          });
        },
      );

      log.info(
        {
          productId: job.data.productId,
          communityId: job.data.communityId,
          scanned: result.scanned,
          dispatched: result.dispatched,
        },
        'scout scan complete',
      );
      return result;
    },
    { connection: deps.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error(
      { jobId: job?.id, err, productId: job?.data.productId, communityId: job?.data.communityId },
      'scout scan failed',
    );
  });

  worker.on('closed', () => {
    void orchestrateQueue.close();
  });

  return worker;
}
