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
