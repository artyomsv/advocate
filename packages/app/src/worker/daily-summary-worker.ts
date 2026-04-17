import type { DailySummary } from '@mynah/engine';
import { type Job, Worker } from 'bullmq';
import { and, count, eq, gte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import { getEnv } from '../config/env.js';
import type * as schema from '../db/schema.js';
import { contentPlans, llmUsage, posts, products } from '../db/schema.js';
import { notifyWorkerFailure } from '../notifications/failure-alerter.js';
import { TelegramNotifier } from '../notifications/telegram.js';
import { type DailySummaryJobData, QUEUE_NAMES } from './queues.js';

export interface DailySummaryWorkerDeps {
  connection: Redis;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
}

/**
 * Composes a daily summary from the last 24h of activity and sends it via
 * Telegram. Silently no-ops when TELEGRAM_BOT_TOKEN / CHANNEL_ID aren't set.
 * Schedule (cron) should be registered in the main worker bootstrap so it
 * fires once per day.
 */
export function createDailySummaryWorker(deps: DailySummaryWorkerDeps): Worker<DailySummaryJobData> {
  const log = deps.logger.child({ component: 'daily-summary-worker' });
  const env = getEnv();

  const worker = new Worker<DailySummaryJobData>(
    QUEUE_NAMES.dailySummary,
    async (_job: Job<DailySummaryJobData>) => {
      if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
        log.info('telegram unset — skipping daily summary');
        return { sent: false };
      }

      const since = new Date(Date.now() - 24 * 3600 * 1000);
      const [planCount, postCount, spendRow] = await Promise.all([
        deps.db
          .select({ c: count() })
          .from(contentPlans)
          .where(gte(contentPlans.createdAt, since)),
        deps.db
          .select({ c: count() })
          .from(posts)
          .where(and(gte(posts.createdAt, since), eq(posts.wasRemoved, false))),
        deps.db
          .select({ c: count() })
          .from(llmUsage)
          .where(gte(llmUsage.createdAt, since)),
      ]);

      const activeProducts = await deps.db
        .select({ id: products.id, name: products.name })
        .from(products)
        .where(eq(products.status, 'active'));

      const plansDrafted = Number(planCount[0]?.c ?? 0);
      const postsLanded = Number(postCount[0]?.c ?? 0);
      const llmCalls = Number(spendRow[0]?.c ?? 0);

      // DailySummary.productId requires a single product. Pick the first
      // active one, falling back to a sentinel when nothing's active yet.
      const primaryProductId = activeProducts[0]?.id ?? '00000000-0000-0000-0000-000000000000';

      const summary: DailySummary = {
        id: `daily-${new Date().toISOString().slice(0, 10)}`,
        productId: primaryProductId,
        date: new Date().toISOString().slice(0, 10),
        headline: `${plansDrafted} plans drafted · ${postsLanded} posted · ${llmCalls} LLM calls`,
        bullets: [
          `Active products: ${activeProducts.map((p) => p.name).join(', ') || 'none'}`,
          `Content plans drafted in 24h: ${plansDrafted}`,
          `Posts that landed and stayed up: ${postsLanded}`,
          `LLM calls: ${llmCalls}`,
        ],
        metrics: {
          plansDrafted,
          postsLanded,
          llmCalls,
        },
      };

      const notifier = new TelegramNotifier({
        botToken: env.TELEGRAM_BOT_TOKEN,
        channelId: env.TELEGRAM_CHANNEL_ID,
      });
      await notifier.sendDailySummary(summary);
      log.info({ plansDrafted, postsLanded, llmCalls }, 'daily summary sent');
      return { sent: true };
    },
    { connection: deps.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err }, 'daily summary failed');
    void notifyWorkerFailure({ worker: 'telegram.daily-summary', jobId: job?.id, err });
  });

  return worker;
}
