import type { Alert } from '@mynah/engine';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';
import { TelegramNotifier } from './telegram.js';

const log = childLogger('failure-alerter');

/**
 * Lazy singleton so we pay the Bot setup cost at most once per process.
 * Returns null when TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is unset —
 * failure alerts silently no-op in that case, keeping the worker path
 * free of guards.
 */
let cached: TelegramNotifier | null | undefined;

function getNotifier(): TelegramNotifier | null {
  if (cached !== undefined) return cached;
  const env = getEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    cached = null;
    return null;
  }
  try {
    cached = new TelegramNotifier({
      botToken: env.TELEGRAM_BOT_TOKEN,
      channelId: env.TELEGRAM_CHANNEL_ID,
    });
  } catch (err) {
    log.error({ err }, 'failed to construct telegram notifier');
    cached = null;
  }
  return cached;
}

export interface WorkerFailureArgs {
  /** Short worker identifier — e.g. 'orchestrate', 'post.publish'. */
  worker: string;
  /** BullMQ job id (may be undefined when the job itself is missing). */
  jobId?: string;
  /** Any structured context — content_plan_id, scout target, etc. */
  context?: Record<string, unknown>;
  err: unknown;
}

export async function notifyWorkerFailure(args: WorkerFailureArgs): Promise<void> {
  const notifier = getNotifier();
  if (!notifier) return;

  const errMessage = args.err instanceof Error ? args.err.message : String(args.err);
  const contextLines = args.context
    ? Object.entries(args.context)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `• ${k}: ${String(v)}`)
        .join('\n')
    : '';

  const alert: Alert = {
    id: `worker-failure-${args.worker}-${args.jobId ?? 'nojob'}-${Date.now()}`,
    level: 'error',
    subject: `Worker failed: ${args.worker}`,
    details:
      `Job ${args.jobId ?? '(no id)'} threw during processing.\n\n` +
      (contextLines ? `${contextLines}\n\n` : '') +
      `Error: ${errMessage}`,
  };

  try {
    await notifier.sendAlert(alert);
  } catch (sendErr) {
    log.error({ sendErr, originalErr: args.err }, 'failed to send failure alert');
  }
}

/**
 * Fire-and-forget generic alert dispatch. Silently no-ops when Telegram is
 * unconfigured. Use for non-failure ops signals (post removed, kill switch,
 * threshold crossed).
 */
export async function notifyAlert(
  level: Alert['level'],
  subject: string,
  details: string,
  context?: Record<string, unknown>,
): Promise<void> {
  const notifier = getNotifier();
  if (!notifier) return;

  const contextLines = context
    ? Object.entries(context)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `• ${k}: ${String(v)}`)
        .join('\n')
    : '';

  const alert: Alert = {
    id: `alert-${subject.replace(/\W+/g, '-').slice(0, 40)}-${Date.now()}`,
    level,
    subject,
    details: contextLines ? `${details}\n\n${contextLines}` : details,
  };

  try {
    await notifier.sendAlert(alert);
  } catch (sendErr) {
    log.error({ sendErr, subject }, 'failed to send alert');
  }
}
