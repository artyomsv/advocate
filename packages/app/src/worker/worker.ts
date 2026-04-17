import type { Worker } from 'bullmq';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ContentPlanService } from '../content-plans/content-plan.service.js';
import { closeDb, getDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis, getRedis } from '../queue/connection.js';
import type { RedditAppConfig } from '../reddit/oauth.js';
import { SecretsService } from '../secrets/secrets.service.js';
import { createOrchestrateWorker } from './orchestrate-worker.js';
import { createPostPublishWorker } from './post-publish-worker.js';
import type { PostPublishJobData, ScoutScanJobData } from './queues.js';
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

  const { router, activeProviders } = createDefaultRouter({ env });
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
  } else {
    log.info('Reddit not configured, post-publish + scout workers not started');
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

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'shutting down');
    await orchestrate.close();
    if (posting) await posting.close();
    if (scout) await scout.close();
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
