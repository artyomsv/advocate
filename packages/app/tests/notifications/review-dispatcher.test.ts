import { describe, expect, it, vi } from 'vitest';
import type { ContentPlan } from '../../src/db/schema.js';
import { ReviewDispatcher } from '../../src/notifications/review-dispatcher.js';
import type { TelegramNotifier } from '../../src/notifications/telegram.js';

function fakePlan(over: Partial<ContentPlan> = {}): ContentPlan {
  return {
    id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    campaignId: null,
    legendId: 'l',
    legendAccountId: null,
    communityId: 'c',
    contentType: 'value_post',
    promotionLevel: 2,
    threadUrl: null,
    threadContext: 'ctx',
    scheduledAt: new Date(),
    status: 'review',
    generatedContent: 'body',
    qualityScore: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    createdAt: new Date(),
    ...over,
  } as unknown as ContentPlan;
}

describe('ReviewDispatcher', () => {
  it('sends when status=review', async () => {
    const send = vi.fn().mockResolvedValue({
      providerId: 'telegram',
      providerMessageId: '1',
      sentAt: new Date().toISOString(),
    });
    const dispatcher = new ReviewDispatcher({
      notifier: { sendApprovalWithButtons: send } as unknown as TelegramNotifier,
    });
    await dispatcher.dispatchIfReview(fakePlan());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('skips non-review status', async () => {
    const send = vi.fn();
    const dispatcher = new ReviewDispatcher({
      notifier: { sendApprovalWithButtons: send } as unknown as TelegramNotifier,
    });
    await dispatcher.dispatchIfReview(fakePlan({ status: 'approved' }));
    expect(send).not.toHaveBeenCalled();
  });

  it('no-ops when notifier is null', async () => {
    const dispatcher = new ReviewDispatcher({ notifier: null });
    await dispatcher.dispatchIfReview(fakePlan());
  });
});
