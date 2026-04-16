# Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the one-way notification abstraction — the engine's `NotificationSender` interface for alerts, daily summaries, milestones, and approval messages — plus an in-memory reference implementation and a concrete `TelegramNotifier` using the `grammy` SDK. Two-way approval flow (button callbacks from Telegram → back into the agent system) is deferred to Plan 16, which stands up the full Telegram bot with webhook handling.

**Architecture:** Engine defines a **send-only** interface because that's what's needed for the owner's main use cases (alerts, daily summaries, milestones). Approval messages ARE sent through the same interface, but the response arrives later through a separate mechanism — the dashboard UI in the short term, the Telegram bot webhook in Plan 16. Splitting send from receive keeps each plan focused and both interfaces testable in isolation.

**Tech Stack:** `grammy` (Telegram Bot SDK) — already installed from Plan 01

**Prerequisites:**
- Plan 06.5 complete (tag `plan06.5-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`
- `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` set in `.env` for integration tests to run (otherwise they skip)

---

## File Structure Overview

```
packages/engine/src/notifications/
├── index.ts                         # Barrel
├── types.ts                         # Alert, DailySummary, Milestone, ApprovalRequest + supporting types
└── sender.ts                        # NotificationSender interface + InMemoryNotificationSender

packages/app/src/notifications/
├── index.ts                         # Barrel
└── telegram.ts                      # TelegramNotifier implementing NotificationSender

packages/engine/tests/notifications/
└── sender.test.ts                   # InMemoryNotificationSender behavior

packages/app/tests/notifications/
├── telegram.unit.test.ts            # Construction + message formatting (no API)
└── telegram.integration.test.ts     # Real Telegram API, skipIf no token
```

## Design decisions

1. **Send-only interface.** No `requestApproval` that awaits a response. Approval messages are a send-type with an embedded `requestId` the receiver can echo back through another channel (dashboard click → API → approval record → agent unblocks). Two-way wiring lands in Plan 16.

2. **Per-product channels are the caller's responsibility.** `TelegramNotifier` takes a `{ botToken, channelId }` pair at construction. Higher-level code (Plan 11 Campaign Lead) instantiates a notifier per product and decides which channel to use.

3. **Message formatting is baked into the notifier.** The engine types carry semantic fields (urgency, bullets, metrics); the notifier chooses the final visual representation (emoji, bold, line breaks). This keeps agents focused on content rather than presentation.

4. **`InMemoryNotificationSender` records everything.** Tests assert on the recorded payloads. Useful as a test-double AND as the production fallback when Telegram isn't configured — the app still runs, notifications just go nowhere (with a log warning).

5. **No retries at this layer.** `grammy` handles its own retries on transient 5xx errors. If a notification permanently fails, the caller sees the error — the layer above (Campaign Lead) decides whether to retry, queue, or give up.

---

## Task 1: Notification Types

**Files:**
- Create: `packages/engine/src/notifications/types.ts`

- [ ] **Step 1.1: Create the types file**

```typescript
import type { IsoTimestamp } from '../types/common.js';

export type NotificationLevel = 'info' | 'warning' | 'error' | 'critical';
export type NotificationUrgency = 'low' | 'medium' | 'high' | 'critical';

export type NotificationKind =
  | 'alert'
  | 'daily_summary'
  | 'weekly_report'
  | 'milestone'
  | 'approval_request'
  | 'strategy_question';

/**
 * Something the human should know about but doesn't need to act on urgently.
 * Log entries, account warnings, rate-limit hits surface as alerts.
 */
export interface Alert {
  id: string;
  /** Product this alert pertains to (if any). Omit for system-wide alerts. */
  productId?: string;
  level: NotificationLevel;
  subject: string;
  details: string;
  metadata?: Record<string, unknown>;
}

/** End-of-day recap of agent activity + metrics. */
export interface DailySummary {
  id: string;
  productId: string;
  /** YYYY-MM-DD (product's local date). */
  date: string;
  headline: string;
  bullets: readonly string[];
  /** Optional key metrics to surface under the bullets. */
  metrics?: Record<string, number | string>;
}

/** Weekly recap — same shape as daily but wider period. */
export interface WeeklyReport {
  id: string;
  productId: string;
  /** ISO week "YYYY-Www" (e.g. "2026-W16"). */
  week: string;
  headline: string;
  bullets: readonly string[];
  metrics?: Record<string, number | string>;
}

/** A notable achievement the agent system wants the owner to see. */
export interface Milestone {
  id: string;
  productId: string;
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

/**
 * A message asking the owner to approve something. The send-only sender
 * posts this with an embedded `requestId`; a separate mechanism (dashboard
 * in MVP, Telegram bot webhook in Plan 16) carries the response back.
 */
export interface ApprovalRequest {
  id: string;
  productId?: string;
  urgency: NotificationUrgency;
  subject: string;
  summary: string;
  options: readonly ApprovalOption[];
  /**
   * Content preview (e.g., the draft post). Omitted when the approval is about
   * a non-content decision (e.g., "pause Lisa for a week?").
   */
  contentPreview?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalOption {
  id: string;
  label: string;
  /** If true, highlighted as the recommended default. */
  isDefault?: boolean;
}

/**
 * Open-ended question to the owner, e.g. "We hit a new community —
 * tone down or explore?". Similar to approval but free-form response.
 */
export interface StrategyQuestion {
  id: string;
  productId?: string;
  subject: string;
  context: string;
  metadata?: Record<string, unknown>;
}

/**
 * Union of every notification shape, tagged with its kind. Useful as a
 * discriminated union for handlers that want to process them generically.
 */
export type Notification =
  | ({ kind: 'alert' } & Alert)
  | ({ kind: 'daily_summary' } & DailySummary)
  | ({ kind: 'weekly_report' } & WeeklyReport)
  | ({ kind: 'milestone' } & Milestone)
  | ({ kind: 'approval_request' } & ApprovalRequest)
  | ({ kind: 'strategy_question' } & StrategyQuestion);

/**
 * Provider-specific result of sending a message. Callers can store this if
 * they later want to reference the posted message (e.g. update an alert).
 */
export interface SendResult {
  providerId: string;
  providerMessageId: string;
  sentAt: IsoTimestamp;
}
```

- [ ] **Step 1.2: Typecheck + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/engine typecheck
git add packages/engine/src/notifications/
git commit -m "feat(engine): add notification domain types (Alert, DailySummary, Milestone, ApprovalRequest)"
```

---

## Task 2: NotificationSender Interface + InMemory Impl

**Files:**
- Create: `packages/engine/src/notifications/sender.ts`
- Create: `packages/engine/tests/notifications/sender.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Create `packages/engine/tests/notifications/sender.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryNotificationSender } from '../../src/notifications/sender.js';
import type {
  Alert,
  ApprovalRequest,
  DailySummary,
  Milestone,
} from '../../src/notifications/types.js';

describe('InMemoryNotificationSender', () => {
  let sender: InMemoryNotificationSender;

  beforeEach(() => {
    sender = new InMemoryNotificationSender();
  });

  it('providerId is "in-memory"', () => {
    expect(sender.providerId).toBe('in-memory');
  });

  it('sendAlert records the alert + returns SendResult', async () => {
    const alert: Alert = {
      id: 'a1',
      level: 'warning',
      subject: 's',
      details: 'd',
    };
    const result = await sender.sendAlert(alert);
    expect(result.providerId).toBe('in-memory');
    expect(result.providerMessageId).toMatch(/^msg-/);
    expect(result.sentAt).toMatch(/^\d{4}-/);

    expect(sender.recorded).toHaveLength(1);
    expect(sender.recorded[0]?.kind).toBe('alert');
  });

  it('sendDailySummary records + tags as daily_summary', async () => {
    const summary: DailySummary = {
      id: 'd1',
      productId: 'p1',
      date: '2026-04-16',
      headline: 'good day',
      bullets: ['b1', 'b2'],
    };
    await sender.sendDailySummary(summary);
    expect(sender.recorded[0]?.kind).toBe('daily_summary');
  });

  it('sendMilestone records + tags as milestone', async () => {
    const m: Milestone = {
      id: 'm1',
      productId: 'p1',
      title: '500 karma',
      description: 'Dave hit 500 karma in r/Plumbing',
    };
    await sender.sendMilestone(m);
    expect(sender.recorded[0]?.kind).toBe('milestone');
  });

  it('sendApprovalRequest records + tags as approval_request', async () => {
    const req: ApprovalRequest = {
      id: 'r1',
      urgency: 'medium',
      subject: 'Approve draft?',
      summary: 'Dave wants to post...',
      options: [
        { id: 'approve', label: 'Approve', isDefault: true },
        { id: 'reject', label: 'Reject' },
      ],
    };
    await sender.sendApprovalRequest(req);
    expect(sender.recorded[0]?.kind).toBe('approval_request');
  });

  it('records multiple messages in order', async () => {
    await sender.sendAlert({ id: '1', level: 'info', subject: 's1', details: 'd' });
    await sender.sendAlert({ id: '2', level: 'info', subject: 's2', details: 'd' });
    expect(sender.recorded).toHaveLength(2);
    expect((sender.recorded[0] as { subject: string }).subject).toBe('s1');
    expect((sender.recorded[1] as { subject: string }).subject).toBe('s2');
  });

  it('clear() empties the record', async () => {
    await sender.sendAlert({ id: '1', level: 'info', subject: 's', details: 'd' });
    sender.clear();
    expect(sender.recorded).toHaveLength(0);
  });
});
```

- [ ] **Step 2.2: Run test — MUST FAIL**

```bash
mkdir -p packages/engine/tests/notifications
pnpm --filter @advocate/engine test notifications/sender
```

- [ ] **Step 2.3: Implement `packages/engine/src/notifications/sender.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type {
  Alert,
  ApprovalRequest,
  DailySummary,
  Milestone,
  Notification,
  SendResult,
  StrategyQuestion,
  WeeklyReport,
} from './types.js';

/**
 * Send-only outbound notification channel. Two-way approval response handling
 * (receiving button clicks from Telegram) is a separate concern — Plan 16.
 *
 * Implementations MUST be idempotent on the same `<message>.id`: sending the
 * same Alert twice should produce two deliveries in-memory (since the caller
 * may legitimately want to re-send), but should NOT throw or corrupt state.
 */
export interface NotificationSender {
  readonly providerId: string;
  sendAlert(alert: Alert): Promise<SendResult>;
  sendDailySummary(summary: DailySummary): Promise<SendResult>;
  sendWeeklyReport(report: WeeklyReport): Promise<SendResult>;
  sendMilestone(milestone: Milestone): Promise<SendResult>;
  sendApprovalRequest(request: ApprovalRequest): Promise<SendResult>;
  sendStrategyQuestion(question: StrategyQuestion): Promise<SendResult>;
}

/**
 * Test-double and fallback sender. Records every notification for inspection.
 * Also suitable as the production fallback when Telegram isn't configured —
 * the app keeps running, notifications just go nowhere (consult `recorded`
 * or hook a log drain to see them).
 */
export class InMemoryNotificationSender implements NotificationSender {
  readonly providerId = 'in-memory';
  readonly #recorded: Notification[] = [];

  get recorded(): readonly Notification[] {
    return [...this.#recorded];
  }

  clear(): void {
    this.#recorded.length = 0;
  }

  async sendAlert(alert: Alert): Promise<SendResult> {
    this.#recorded.push({ kind: 'alert', ...alert });
    return this.#result();
  }

  async sendDailySummary(summary: DailySummary): Promise<SendResult> {
    this.#recorded.push({ kind: 'daily_summary', ...summary });
    return this.#result();
  }

  async sendWeeklyReport(report: WeeklyReport): Promise<SendResult> {
    this.#recorded.push({ kind: 'weekly_report', ...report });
    return this.#result();
  }

  async sendMilestone(milestone: Milestone): Promise<SendResult> {
    this.#recorded.push({ kind: 'milestone', ...milestone });
    return this.#result();
  }

  async sendApprovalRequest(request: ApprovalRequest): Promise<SendResult> {
    this.#recorded.push({ kind: 'approval_request', ...request });
    return this.#result();
  }

  async sendStrategyQuestion(question: StrategyQuestion): Promise<SendResult> {
    this.#recorded.push({ kind: 'strategy_question', ...question });
    return this.#result();
  }

  #result(): SendResult {
    return {
      providerId: this.providerId,
      providerMessageId: `msg-${randomUUID()}`,
      sentAt: isoNow(),
    };
  }
}
```

- [ ] **Step 2.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test notifications/sender
pnpm lint
git add packages/engine/src/notifications/sender.ts packages/engine/tests/notifications/sender.test.ts
git commit -m "feat(engine): add NotificationSender interface + InMemoryNotificationSender"
```

---

## Task 3: TelegramNotifier

**Files:**
- Create: `packages/app/src/notifications/telegram.ts`
- Create: `packages/app/tests/notifications/telegram.unit.test.ts`
- Create: `packages/app/tests/notifications/telegram.integration.test.ts`

- [ ] **Step 3.1: Write unit test FIRST (no API)**

Create `packages/app/tests/notifications/telegram.unit.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { TelegramNotifier, formatAlert, formatDailySummary } from '../../src/notifications/telegram.js';

describe('TelegramNotifier (unit)', () => {
  it('providerId is "telegram"', () => {
    const n = new TelegramNotifier({ botToken: 'fake', channelId: '-1001234567890' });
    expect(n.providerId).toBe('telegram');
  });

  it('rejects empty botToken at construction', () => {
    expect(() => new TelegramNotifier({ botToken: '', channelId: '1' })).toThrow(/botToken/i);
  });

  it('rejects empty channelId at construction', () => {
    expect(() => new TelegramNotifier({ botToken: 'x', channelId: '' })).toThrow(/channelId/i);
  });
});

describe('formatAlert', () => {
  it('prefixes by level with an emoji', () => {
    expect(formatAlert({ id: '1', level: 'info', subject: 's', details: 'd' }))
      .toContain('ℹ️');
    expect(formatAlert({ id: '1', level: 'warning', subject: 's', details: 'd' }))
      .toMatch(/⚠️/);
    expect(formatAlert({ id: '1', level: 'error', subject: 's', details: 'd' }))
      .toMatch(/🚨|❌/);
    expect(formatAlert({ id: '1', level: 'critical', subject: 's', details: 'd' }))
      .toMatch(/🆘|🚨/);
  });

  it('includes subject and details', () => {
    const text = formatAlert({ id: '1', level: 'info', subject: 'the subj', details: 'the detail' });
    expect(text).toContain('the subj');
    expect(text).toContain('the detail');
  });
});

describe('formatDailySummary', () => {
  it('includes headline, bullets, and optional metrics', () => {
    const text = formatDailySummary({
      id: '1',
      productId: 'p',
      date: '2026-04-16',
      headline: 'good day',
      bullets: ['b1', 'b2'],
      metrics: { posts: 8, karma: 23 },
    });
    expect(text).toContain('good day');
    expect(text).toContain('b1');
    expect(text).toContain('b2');
    expect(text).toContain('posts');
    expect(text).toContain('23');
    expect(text).toContain('2026-04-16');
  });

  it('works without metrics', () => {
    const text = formatDailySummary({
      id: '1',
      productId: 'p',
      date: '2026-04-16',
      headline: 'h',
      bullets: ['b'],
    });
    expect(text).toContain('h');
  });
});
```

- [ ] **Step 3.2: Write integration test**

Create `packages/app/tests/notifications/telegram.integration.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { TelegramNotifier } from '../../src/notifications/telegram.js';

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const channelId = process.env.TELEGRAM_CHANNEL_ID;
const enabled = !!botToken && !!channelId;

describe.skipIf(!enabled)('TelegramNotifier (integration)', () => {
  it('sends an alert to the configured channel', async () => {
    const notifier = new TelegramNotifier({ botToken: botToken!, channelId: channelId! });
    const result = await notifier.sendAlert({
      id: 'test-alert-1',
      level: 'info',
      subject: 'Advocate integration test',
      details: 'If you see this, TelegramNotifier works end-to-end. Safe to delete.',
    });
    expect(result.providerId).toBe('telegram');
    expect(result.providerMessageId).toMatch(/^\d+$/); // Telegram message IDs are numeric strings
  }, 30_000);
});
```

- [ ] **Step 3.3: Run test — MUST FAIL**

```bash
mkdir -p packages/app/tests/notifications
pnpm --filter @advocate/app test notifications/telegram
```

- [ ] **Step 3.4: Implement `packages/app/src/notifications/telegram.ts`**

```typescript
import { Bot } from 'grammy';
import type {
  Alert,
  ApprovalRequest,
  DailySummary,
  Milestone,
  NotificationSender,
  SendResult,
  StrategyQuestion,
  WeeklyReport,
} from '@advocate/engine';
import { isoNow } from '@advocate/engine';
import { childLogger } from '../config/logger.js';

const log = childLogger('telegram');

export interface TelegramNotifierOptions {
  botToken: string;
  /** Channel / chat ID. Numeric (prefixed `-100` for channels) or `@name`. */
  channelId: string;
}

const LEVEL_EMOJI = {
  info: 'ℹ️',
  warning: '⚠️',
  error: '🚨',
  critical: '🆘',
} as const;

const URGENCY_EMOJI = {
  low: '🟢',
  medium: '🟡',
  high: '🟠',
  critical: '🔴',
} as const;

export function formatAlert(alert: Alert): string {
  const emoji = LEVEL_EMOJI[alert.level];
  return `${emoji} *${escapeMarkdown(alert.subject)}*\n\n${escapeMarkdown(alert.details)}`;
}

export function formatDailySummary(summary: DailySummary): string {
  const lines = [
    `📊 *Daily summary — ${escapeMarkdown(summary.date)}*`,
    '',
    `_${escapeMarkdown(summary.headline)}_`,
    '',
    ...summary.bullets.map((b) => `• ${escapeMarkdown(b)}`),
  ];
  if (summary.metrics) {
    lines.push('');
    lines.push('*Metrics*');
    for (const [k, v] of Object.entries(summary.metrics)) {
      lines.push(`• ${escapeMarkdown(k)}: ${escapeMarkdown(String(v))}`);
    }
  }
  return lines.join('\n');
}

export function formatWeeklyReport(report: WeeklyReport): string {
  const lines = [
    `📈 *Weekly report — ${escapeMarkdown(report.week)}*`,
    '',
    `_${escapeMarkdown(report.headline)}_`,
    '',
    ...report.bullets.map((b) => `• ${escapeMarkdown(b)}`),
  ];
  if (report.metrics) {
    lines.push('');
    lines.push('*Metrics*');
    for (const [k, v] of Object.entries(report.metrics)) {
      lines.push(`• ${escapeMarkdown(k)}: ${escapeMarkdown(String(v))}`);
    }
  }
  return lines.join('\n');
}

export function formatMilestone(milestone: Milestone): string {
  return `🎯 *${escapeMarkdown(milestone.title)}*\n\n${escapeMarkdown(milestone.description)}`;
}

export function formatApprovalRequest(request: ApprovalRequest): string {
  const urgency = URGENCY_EMOJI[request.urgency];
  const lines = [
    `${urgency} *Approval needed — ${escapeMarkdown(request.subject)}*`,
    '',
    escapeMarkdown(request.summary),
  ];
  if (request.contentPreview) {
    lines.push('', '```', request.contentPreview, '```');
  }
  lines.push('', '*Options:*');
  for (const opt of request.options) {
    lines.push(`• \`${escapeMarkdown(opt.id)}\`${opt.isDefault ? ' (default)' : ''} — ${escapeMarkdown(opt.label)}`);
  }
  lines.push('', `_Request ID: \`${escapeMarkdown(request.id)}\`_`);
  return lines.join('\n');
}

export function formatStrategyQuestion(question: StrategyQuestion): string {
  return `🤔 *${escapeMarkdown(question.subject)}*\n\n${escapeMarkdown(question.context)}\n\n_Question ID: \`${escapeMarkdown(question.id)}\`_`;
}

/**
 * Very minimal MarkdownV2 escaping — Telegram requires escaping `_*[]()~\`>#+-=|{}.!`
 * when using `parse_mode: 'MarkdownV2'`. The formatters above explicitly use
 * some of these characters unescaped (the `*` for bold, the backticks for code),
 * so we escape the user-provided content only.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, (c) => `\\${c}`);
}

export class TelegramNotifier implements NotificationSender {
  readonly providerId = 'telegram';
  readonly #bot: Bot;
  readonly #channelId: string;

  constructor(options: TelegramNotifierOptions) {
    if (!options.botToken) throw new Error('botToken must be non-empty');
    if (!options.channelId) throw new Error('channelId must be non-empty');
    this.#bot = new Bot(options.botToken);
    this.#channelId = options.channelId;
  }

  async sendAlert(alert: Alert): Promise<SendResult> {
    return this.#send(formatAlert(alert));
  }

  async sendDailySummary(summary: DailySummary): Promise<SendResult> {
    return this.#send(formatDailySummary(summary));
  }

  async sendWeeklyReport(report: WeeklyReport): Promise<SendResult> {
    return this.#send(formatWeeklyReport(report));
  }

  async sendMilestone(milestone: Milestone): Promise<SendResult> {
    return this.#send(formatMilestone(milestone));
  }

  async sendApprovalRequest(request: ApprovalRequest): Promise<SendResult> {
    return this.#send(formatApprovalRequest(request));
  }

  async sendStrategyQuestion(question: StrategyQuestion): Promise<SendResult> {
    return this.#send(formatStrategyQuestion(question));
  }

  async #send(text: string): Promise<SendResult> {
    try {
      const message = await this.#bot.api.sendMessage(this.#channelId, text, {
        parse_mode: 'MarkdownV2',
      });
      return {
        providerId: this.providerId,
        providerMessageId: String(message.message_id),
        sentAt: isoNow(),
      };
    } catch (err) {
      log.error({ err }, 'telegram sendMessage failed');
      throw err;
    }
  }
}
```

- [ ] **Step 3.5: Run tests + commit**

```bash
pnpm --filter @advocate/app test notifications/telegram
pnpm lint
git add packages/app/src/notifications/telegram.ts packages/app/tests/notifications/
git commit -m "feat(app): add TelegramNotifier (send-only) with unit + skipIf integration tests"
```

---

## Task 4: Barrel + Docker Verification + Tag

- [ ] **Step 4.1: Create engine notifications barrel**

`packages/engine/src/notifications/index.ts`:

```typescript
export * from './sender.js';
export * from './types.js';
```

- [ ] **Step 4.2: Extend engine public barrel `packages/engine/src/index.ts`**

Append:

```typescript
// Notifications
export {
  InMemoryNotificationSender,
  type NotificationSender,
} from './notifications/sender.js';
export type {
  Alert,
  ApprovalOption,
  ApprovalRequest,
  DailySummary,
  Milestone,
  Notification,
  NotificationKind,
  NotificationLevel,
  NotificationUrgency,
  SendResult,
  StrategyQuestion,
  WeeklyReport,
} from './notifications/types.js';
```

Biome will alphabetize; accept.

- [ ] **Step 4.3: Create app notifications barrel**

`packages/app/src/notifications/index.ts`:

```typescript
export * from './telegram.js';
```

- [ ] **Step 4.4: Verify full suite**

```bash
pnpm --filter @advocate/engine typecheck
pnpm --filter @advocate/engine build
pnpm --filter @advocate/engine test
pnpm --filter @advocate/app typecheck
pnpm --filter @advocate/app test
pnpm lint
```

Expected:
- Engine tests ~ 108 (existing) + 7 sender ≈ 115 passing
- App tests ~ 41 (existing) + 3 pricing + 3 telegram unit + (0 or 1) telegram integration ≈ 47 or 48 passing

- [ ] **Step 4.5: Commit + push**

```bash
git add packages/engine/src/ packages/app/src/
git commit -m "feat: expose notifications via engine + app public barrels"
git push origin master
```

- [ ] **Step 4.6: Docker round-trip**

```bash
docker compose down
docker compose up -d --build
# wait for api healthy
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

Must return `{"status":"ok","checks":{"database":true,"redis":true}}`.

- [ ] **Step 4.7: Tag + push**

```bash
git tag -a plan07-complete -m "Plan 07 Notifications (send-only) complete"
git push origin plan07-complete
```

---

## Acceptance Criteria

1. ✅ Notification domain types shipped (Alert, DailySummary, WeeklyReport, Milestone, ApprovalRequest, StrategyQuestion + Notification union)
2. ✅ `NotificationSender` interface + `InMemoryNotificationSender` with 7 tests
3. ✅ `TelegramNotifier` implementing `NotificationSender` with 3 unit tests + 1 skipIf integration test
4. ✅ Message formatting utilities (`formatAlert`, `formatDailySummary`, etc.) exported for reuse
5. ✅ All exports surfaced via engine + app barrels
6. ✅ `pnpm verify` passes
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan07-complete` pushed

## Out of Scope

- **Two-way approval flow** (receiving Telegram button clicks) → Plan 16 full Telegram integration
- **Bot registration / webhook setup** → Plan 16
- **Multi-channel routing** (different channels per product) — caller instantiates multiple notifiers
- **Rate limiting / queueing** — if needed, wrap in a per-channel queue at the app level
- **StorageProvider + Drizzle-backed stores** → Plan 07.5

---

**End of Plan 07 (Notifications).**
