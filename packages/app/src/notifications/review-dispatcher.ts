import type { ContentPlan } from '../db/schema.js';
import type { TelegramNotifier } from './telegram.js';

export interface ReviewDispatcherDeps {
  notifier: TelegramNotifier | null;
}

/**
 * Fires a Telegram approval request when a freshly persisted content plan
 * lands at status=review. No-ops when no notifier is configured
 * (TELEGRAM_BOT_TOKEN unset).
 */
export class ReviewDispatcher {
  readonly #notifier: TelegramNotifier | null;

  constructor(deps: ReviewDispatcherDeps) {
    this.#notifier = deps.notifier;
  }

  async dispatchIfReview(plan: ContentPlan): Promise<void> {
    if (plan.status !== 'review') return;
    if (!this.#notifier) return;
    const preview = (plan.generatedContent ?? '').slice(0, 500);
    await this.#notifier.sendApprovalWithButtons(
      {
        id: plan.id,
        subject: `Review: ${plan.contentType} (L${plan.promotionLevel})`,
        urgency: plan.promotionLevel >= 5 ? 'high' : 'medium',
        summary: plan.threadContext ?? `Scheduled ${plan.scheduledAt}`,
        contentPreview: preview,
        options: [
          { id: 'approve', label: 'Approve and post', isDefault: true },
          { id: 'reject', label: 'Reject' },
        ],
      },
      plan.id,
    );
  }
}
