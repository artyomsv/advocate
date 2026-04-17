import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { ContentPlanService } from '../content-plans/content-plan.service.js';
import { closeDb, getDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis, getRedis } from '../queue/connection.js';
import { createOrchestrateWorker } from './orchestrate-worker.js';
import { createTelegramListener, type TelegramListener } from './telegram-listener.js';

/**
 * Worker process entry. Connects to Redis, wires the orchestrator worker,
 * optionally starts the Telegram callback listener, runs until SIGTERM.
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
    await worker.close();
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
