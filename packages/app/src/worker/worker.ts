import { Queue, type Worker } from 'bullmq';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ContentPlanService } from '../content-plans/content-plan.service.js';
import { closeDb, getDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis, getRedis } from '../queue/connection.js';
import type { RedditAppConfig } from '../reddit/oauth.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { type AnalyticsWorkers, createAnalyticsWorkers } from './analytics-workers.js';
import { createDailySummaryWorker } from './daily-summary-worker.js';
import { createOrchestrateWorker } from './orchestrate-worker.js';
import { createPostPublishWorker } from './post-publish-worker.js';
import type {
  DailySummaryJobData,
  PostPublishJobData,
  ScoutScanJobData,
} from './queues.js';
import { QUEUE_NAMES } from './queues.js';
import { createScoutWorker } from './scout-worker.js';
import { createTelegramListener, type TelegramListener } from './telegram-listener.js';

async function resolveRedditConfig(): Promise<RedditAppConfig | null> {
  const secrets = new SecretsService(getDb());
  const [clientId, clientSecret, redirectUri, userAgent] = await Promise.all([
    secrets.resolve('reddit', 'REDDIT_CLIENT_ID'),
    secrets.resolve('reddit', 'REDDIT_CLIENT_SECRET'),
    secrets.resolve('reddit', 'REDDIT_REDIRECT_URI'),
    secrets.resolve('reddit', 'REDDIT_USER_AGENT'),
  ]);
  if (!clientId || !clientSecret || !redirectUri || !userAgent) return null;
  return { clientId, clientSecret, redirectUri, userAgent };
}

async function start(): Promise<void> {
  const env = getEnv();
  const log = logger.child({ component: 'worker-main' });

  log.info({ env: env.NODE_ENV }, 'worker starting');

  const { router, activeProviders } = createDefaultRouter({ env, db: getDb() });
  log.info({ activeProviders }, 'llm router built');

  const orchestrate = createOrchestrateWorker({
    connection: getRedis(),
    router,
    db: getDb(),
    logger,
  });
  log.info('worker listening on queue: orchestrate');

  let posting: Worker<PostPublishJobData> | null = null;
  let scout: Worker<ScoutScanJobData> | null = null;
  let analytics: AnalyticsWorkers | null = null;
  const redditConfig = await resolveRedditConfig();
  if (redditConfig) {
    posting = createPostPublishWorker({
      connection: getRedis(),
      db: getDb(),
      logger,
      redditConfig,
      masterKey: env.CREDENTIAL_MASTER_KEY,
    });
    log.info('worker listening on queue: post.publish');
    scout = createScoutWorker({
      connection: getRedis(),
      db: getDb(),
      logger,
      router,
      redditConfig,
      masterKey: env.CREDENTIAL_MASTER_KEY,
    });
    log.info('worker listening on queue: scout.scan');
    analytics = createAnalyticsWorkers({
      connection: getRedis(),
      db: getDb(),
      logger,
      router,
      redditConfig,
      masterKey: env.CREDENTIAL_MASTER_KEY,
    });
    log.info('worker listening on queues: analytics.fetch, analytics.analyze');
  } else {
    log.info('Reddit not configured, post-publish + scout + analytics workers not started');
  }

  let telegramListener: TelegramListener | null = null;
  if (env.TELEGRAM_BOT_TOKEN) {
    telegramListener = createTelegramListener({
      botToken: env.TELEGRAM_BOT_TOKEN,
      service: new ContentPlanService(getDb()),
      logger,
    });
    telegramListener.start();
  } else {
    log.info('TELEGRAM_BOT_TOKEN not set — callback listener disabled');
  }

  // Daily summary worker + cron. Worker no-ops internally if Telegram env is
  // unset, but we still register the cron so switching the bot on later
  // starts delivering without a redeploy.
  const dailySummaryQueue = new Queue<DailySummaryJobData>(QUEUE_NAMES.dailySummary, {
    connection: getRedis(),
  });
  const dailySummaryWorker = createDailySummaryWorker({
    connection: getRedis(),
    db: getDb(),
    logger,
  });
  // Fire every day at 06:00 UTC. BullMQ dedupes by jobId so re-registering
  // across restarts is safe.
  await dailySummaryQueue.upsertJobScheduler(
    'cron-daily-06utc',
    { pattern: '0 6 * * *', tz: 'UTC' },
    {
      name: 'daily-summary',
      data: {},
      opts: { removeOnComplete: 50, removeOnFail: 50 },
    },
  );
  log.info('worker listening on queue: telegram.daily-summary (cron 06:00 UTC)');

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await orchestrate.close();
    if (posting) await posting.close();
    if (scout) await scout.close();
    if (analytics) {
      await analytics.fetch.close();
      await analytics.analyze.close();
    }
    await dailySummaryWorker.close();
    await dailySummaryQueue.close();
    if (telegramListener) await telegramListener.stop();
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
