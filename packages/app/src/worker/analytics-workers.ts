import type { LLMRouter } from '@mynah/engine';
import { type Job, Worker } from 'bullmq';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import { AnalyticsAnalyst } from '../agents/analytics-analyst.js';
import { MetricsFetcher } from '../analytics/metrics-fetcher.js';
import type * as schema from '../db/schema.js';
import { RedditClient } from '../reddit/client.js';
import type { RedditAppConfig } from '../reddit/oauth.js';
import { RedditTokenStore } from '../reddit/tokens.js';
import {
  type AnalyticsAnalyzeJobData,
  type AnalyticsFetchJobData,
  QUEUE_NAMES,
} from './queues.js';

export interface AnalyticsWorkersDeps {
  connection: Redis;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
  router: LLMRouter;
  redditConfig: RedditAppConfig;
  masterKey: string;
}

export interface AnalyticsWorkers {
  fetch: Worker<AnalyticsFetchJobData>;
  analyze: Worker<AnalyticsAnalyzeJobData>;
}

export function createAnalyticsWorkers(deps: AnalyticsWorkersDeps): AnalyticsWorkers {
  const log = deps.logger.child({ component: 'analytics-workers' });
  const reddit = new RedditClient(
    deps.redditConfig,
    new RedditTokenStore(deps.db, deps.masterKey),
  );
  const fetcher = new MetricsFetcher(deps.db, reddit);
  const analyst = new AnalyticsAnalyst({
    router: deps.router,
    db: deps.db,
    logger: deps.logger,
  });

  const fetchWorker = new Worker<AnalyticsFetchJobData>(
    QUEUE_NAMES.analyticsFetch,
    async (_job: Job<AnalyticsFetchJobData>) => {
      log.info('analytics fetch firing');
      const result = await fetcher.sweep();
      log.info({ ...result }, 'analytics fetch complete');
      return result;
    },
    { connection: deps.connection, concurrency: 1 },
  );

  const analyzeWorker = new Worker<AnalyticsAnalyzeJobData>(
    QUEUE_NAMES.analyticsAnalyze,
    async (job: Job<AnalyticsAnalyzeJobData>) => {
      log.info({ productId: job.data.productId }, 'analytics analyze firing');
      const result = await analyst.generate({
        productId: job.data.productId,
        lookbackDays: job.data.lookbackDays,
      });
      log.info({ productId: job.data.productId, ...result }, 'analytics analyze complete');
      return result;
    },
    { connection: deps.connection, concurrency: 1 },
  );

  fetchWorker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'fetch failed'));
  analyzeWorker.on('failed', (job, err) => log.error({ jobId: job?.id, err }, 'analyze failed'));

  return { fetch: fetchWorker, analyze: analyzeWorker };
}
