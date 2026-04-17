# Telegram Approval Flow (Plan 16)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** When a content plan enters `status=review`, dispatch a Telegram message to the owner's channel with inline Approve / Reject buttons. Button callbacks invoke the same `/content-plans/:id/{approve,reject}` endpoints as the dashboard. Tag `plan16-complete`.

**Architecture:**
- Notifier: `TelegramNotifier` (built in Plan 07) already handles outbound. Plan 16 adds **inline-keyboard** variants + a **bot callback listener** running inside the worker process.
- Dispatcher hook: `OrchestratorService.draft()` calls a new `ReviewDispatcher` after a plan lands at `status=review`, which sends the Telegram message.
- Callback handler: the worker process also launches a `grammy` long-polling listener that catches `callback_query` events, parses the payload, and invokes `ContentPlanService.approve/reject` directly.
- Live verification is a **manual owner step** — requires creating a Telegram bot via @BotFather and pasting the token into `.env`.

**Tech Stack:** grammy (existing) · Fastify 5 (no new routes — callbacks go direct to service)

**Prerequisites:**
- Plan 15 complete (tag `plan15-complete`)
- Plan 14 shipped `ContentPlanService` with approve/reject
- User has NOT yet created a Telegram bot — live verification gated on that

---

## Owner manual prerequisites (before live testing)

1. Open a Telegram chat with `@BotFather`.
2. `/newbot` → pick a name like "Mynah Ops".
3. Copy the bot token into `.env` as `TELEGRAM_BOT_TOKEN=...`.
4. Create a private channel or chat. Add the bot as admin.
5. Get the channel ID:
   - For private channels: forward any message to `@userinfobot`, copy the `Chat Id` (prefixed `-100`).
   - For personal chat: message `@userinfobot` → copy your own ID.
6. Paste into `.env` as `TELEGRAM_CHANNEL_ID=-1001234567890` (or positive integer for chats).
7. Restart the worker: `docker compose restart worker`.
8. Create a new content plan that lands at `review` status — a Telegram message should appear within seconds.

Plan 16 ships without needing steps 1-7 to pass tests, but Task 4's live check requires them.

---

## File Structure Overview

```
packages/app/src/notifications/
├── telegram-inline.ts                  # NEW — callback data codec + inline-keyboard builder
└── telegram.ts                         # MODIFY — add sendApprovalRequestWithButtons

packages/app/src/notifications/
└── review-dispatcher.ts                # NEW — "send approval req when plan → review"

packages/app/src/worker/
├── telegram-listener.ts                # NEW — grammy callback_query handler
└── worker.ts                           # MODIFY — start listener alongside BullMQ worker

packages/app/src/orchestrator/
└── orchestrator.service.ts             # MODIFY — call dispatcher after draft

packages/app/tests/notifications/
├── telegram-inline.test.ts             # callback encode/decode
└── review-dispatcher.test.ts           # asserts dispatcher hits sender
```

---

## Task 1: Callback codec + inline keyboard

**Files:** `packages/app/src/notifications/telegram-inline.ts` + test.

- [ ] **Step 1.1: Codec + keyboard builder**

```typescript
import type { ApprovalRequest } from '@mynah/engine';

/**
 * Callback data has a 64-byte Telegram limit. We encode as `v1:<decision>:<contentPlanId>`
 * which fits for UUID v4 (36 chars) + `v1:approve:` (11) = 47 chars.
 */
export interface CallbackPayload {
  version: 'v1';
  decision: 'approve' | 'reject';
  contentPlanId: string;
}

export function encodeCallback(p: CallbackPayload): string {
  return `${p.version}:${p.decision}:${p.contentPlanId}`;
}

export function decodeCallback(raw: string): CallbackPayload | null {
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [version, decision, contentPlanId] = parts;
  if (version !== 'v1') return null;
  if (decision !== 'approve' && decision !== 'reject') return null;
  if (!contentPlanId || contentPlanId.length < 10) return null;
  return { version, decision, contentPlanId };
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export function buildApprovalKeyboard(contentPlanId: string): InlineKeyboardButton[][] {
  return [
    [
      {
        text: '✅ Approve',
        callback_data: encodeCallback({ version: 'v1', decision: 'approve', contentPlanId }),
      },
      {
        text: '❌ Reject',
        callback_data: encodeCallback({ version: 'v1', decision: 'reject', contentPlanId }),
      },
    ],
  ];
}
```

- [ ] **Step 1.2: Test**

`packages/app/tests/notifications/telegram-inline.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import {
  buildApprovalKeyboard,
  decodeCallback,
  encodeCallback,
} from '../../src/notifications/telegram-inline.js';

describe('telegram-inline codec', () => {
  it('round-trips a valid approve callback', () => {
    const payload = {
      version: 'v1' as const,
      decision: 'approve' as const,
      contentPlanId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    };
    expect(decodeCallback(encodeCallback(payload))).toEqual(payload);
  });

  it('rejects unknown version', () => {
    expect(decodeCallback('v2:approve:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeNull();
  });

  it('rejects unknown decision', () => {
    expect(decodeCallback('v1:maybe:aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeNull();
  });

  it('rejects missing id', () => {
    expect(decodeCallback('v1:approve:')).toBeNull();
  });

  it('buildApprovalKeyboard produces two buttons under 64 bytes', () => {
    const kb = buildApprovalKeyboard('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect(kb).toHaveLength(1);
    expect(kb[0]).toHaveLength(2);
    for (const btn of kb[0]!) {
      expect(btn.callback_data.length).toBeLessThan(64);
    }
  });
});
```

- [ ] **Step 1.3: Commit**

```bash
pnpm --filter @mynah/app test telegram-inline
git add packages/app/src/notifications/telegram-inline.ts packages/app/tests/notifications/telegram-inline.test.ts
git commit -m "feat(notifications): callback codec + approval inline keyboard"
```

---

## Task 2: Telegram sender extension + ReviewDispatcher

**Files:**
- Modify: `packages/app/src/notifications/telegram.ts` — add `sendApprovalWithButtons`
- Create: `packages/app/src/notifications/review-dispatcher.ts`
- Create: `packages/app/tests/notifications/review-dispatcher.test.ts`

- [ ] **Step 2.1: Extend telegram.ts**

Add a new method (near the existing sendApprovalRequest):

```typescript
import { buildApprovalKeyboard } from './telegram-inline.js';
// ... inside TelegramNotifier class:

async sendApprovalWithButtons(
  request: ApprovalRequest,
  contentPlanId: string,
): Promise<SendResult> {
  const text = formatApprovalRequest(request);
  const keyboard = buildApprovalKeyboard(contentPlanId);
  try {
    const message = await this.#bot.api.sendMessage(this.#channelId, text, {
      parse_mode: 'MarkdownV2',
      reply_markup: { inline_keyboard: keyboard },
    });
    return {
      providerId: this.providerId,
      providerMessageId: String(message.message_id),
      sentAt: isoNow(),
    };
  } catch (err) {
    log.error({ err }, 'telegram sendApprovalWithButtons failed');
    throw err;
  }
}
```

- [ ] **Step 2.2: ReviewDispatcher**

```typescript
import type { ContentPlan } from '../db/schema.js';
import type { TelegramNotifier } from './telegram.js';

export interface ReviewDispatcherDeps {
  notifier: TelegramNotifier | null;
}

export class ReviewDispatcher {
  readonly #notifier: TelegramNotifier | null;

  constructor(deps: ReviewDispatcherDeps) {
    this.#notifier = deps.notifier;
  }

  async dispatchIfReview(plan: ContentPlan): Promise<void> {
    if (plan.status !== 'review') return;
    if (!this.#notifier) return; // no-op when Telegram isn't configured
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
```

- [ ] **Step 2.3: Dispatcher test (mocked notifier)**

```typescript
import { describe, expect, it, vi } from 'vitest';
import { ReviewDispatcher } from '../../src/notifications/review-dispatcher.js';
import type { TelegramNotifier } from '../../src/notifications/telegram.js';
import type { ContentPlan } from '../../src/db/schema.js';

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
  } as ContentPlan;
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
    // Succeeds silently
  });
});
```

- [ ] **Step 2.4: Commit**

```bash
pnpm --filter @mynah/app test review-dispatcher
pnpm --filter @mynah/app typecheck
git add packages/app/src/notifications/ packages/app/tests/notifications/review-dispatcher.test.ts
git commit -m "feat(notifications): ReviewDispatcher + sendApprovalWithButtons"
```

---

## Task 3: Wire into orchestrator + worker callback listener

**Files:**
- Modify: `packages/app/src/orchestrator/orchestrator.service.ts` — optional ReviewDispatcher dependency; call after plan persisted
- Create: `packages/app/src/worker/telegram-listener.ts`
- Modify: `packages/app/src/worker/worker.ts`

- [ ] **Step 3.1: OrchestratorService optional dispatcher**

Add a constructor field (optional), and after the `INSERT content_plans ...` step, call `await this.#dispatcher?.dispatchIfReview(row);`. Keep the existing code paths intact — when `AUTH_DEV_BYPASS=true` or Telegram isn't configured, dispatcher is null and the call no-ops.

- [ ] **Step 3.2: `telegram-listener.ts`**

```typescript
import type pino from 'pino';
import { Bot } from 'grammy';
import type { ContentPlanService } from '../content-plans/content-plan.service.js';
import { decodeCallback } from '../notifications/telegram-inline.js';

export interface TelegramListenerDeps {
  botToken: string;
  service: ContentPlanService;
  logger: pino.Logger;
}

export function createTelegramListener(deps: TelegramListenerDeps): { start: () => void; stop: () => Promise<void> } {
  const log = deps.logger.child({ component: 'telegram-listener' });
  const bot = new Bot(deps.botToken);

  bot.on('callback_query:data', async (ctx) => {
    const raw = ctx.callbackQuery.data;
    const payload = decodeCallback(raw);
    if (!payload) {
      log.warn({ raw }, 'invalid callback payload');
      await ctx.answerCallbackQuery({ text: 'Unknown action' });
      return;
    }
    try {
      const updated =
        payload.decision === 'approve'
          ? await deps.service.approve(payload.contentPlanId)
          : await deps.service.reject(payload.contentPlanId);
      log.info(
        { contentPlanId: updated.id, newStatus: updated.status },
        'callback decision applied',
      );
      await ctx.answerCallbackQuery({ text: `Marked ${updated.status}` });
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch (err) {
      log.error({ err, payload }, 'callback decision failed');
      await ctx.answerCallbackQuery({ text: 'Failed — see server log' });
    }
  });

  return {
    start: () => {
      void bot.start({ onStart: () => log.info('telegram listener started') });
    },
    stop: () => bot.stop(),
  };
}
```

- [ ] **Step 3.3: Wire listener in `worker.ts`**

In the `start()` function, AFTER the BullMQ worker is created:

```typescript
const env = getEnv();
// ...
if (env.TELEGRAM_BOT_TOKEN) {
  const service = new ContentPlanService(getDb());
  const listener = createTelegramListener({
    botToken: env.TELEGRAM_BOT_TOKEN,
    service,
    logger,
  });
  listener.start();
  // Ensure SIGTERM also stops listener
  process.on('SIGTERM', () => void listener.stop());
}
```

- [ ] **Step 3.4: Typecheck + commit**

```bash
pnpm --filter @mynah/app typecheck
git add packages/app/src/worker/telegram-listener.ts packages/app/src/worker/worker.ts packages/app/src/orchestrator/orchestrator.service.ts
git commit -m "feat(worker): telegram callback listener + orchestrator dispatch hook"
```

---

## Task 4: Verify + tag

**Dev (no bot) verification:**

- [ ] Unit tests pass (codec, dispatcher)
- [ ] Typecheck clean

```bash
pnpm --filter @mynah/app test
pnpm --filter @mynah/app typecheck
```

**Live (requires bot):**

- [ ] `.env` has `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID`
- [ ] `docker compose up -d --build`
- [ ] Seed a content_plan at `status=review` (or let a schedule fire). Expect a Telegram message with Approve + Reject buttons.
- [ ] Tap Approve. DB row moves to `approved`. Message markup clears.

**Tag regardless of live step:**

```bash
git tag -a plan16-complete -m "Plan 16 (Telegram approval) code complete; live verification gated on owner creating bot"
git push origin master
git push origin plan16-complete
```

---

## Acceptance Criteria

1. ✅ Callback codec round-trips + rejects bad payloads (5 tests)
2. ✅ `sendApprovalWithButtons` renders inline keyboard
3. ✅ `ReviewDispatcher` sends on `status=review`, skips otherwise, no-ops without notifier (3 tests)
4. ✅ Worker launches `telegram-listener` when `TELEGRAM_BOT_TOKEN` is set; wired to `ContentPlanService`
5. ✅ Orchestrator optionally calls dispatcher after persist
6. ⚪ Live Telegram round-trip — owner manual verification

## Out of Scope

- **Daily summaries / weekly reports** — the formatters exist; scheduling them is a future plan
- **Alert pipeline** (agent failures → Telegram) — add when we have agent-failure sinks
- **Per-user DM targeting** — one shared ops channel for MVP
- **Bot command surface** (`/status`, `/cancel`) — add when owner needs it

---

**End of Plan 16.**
