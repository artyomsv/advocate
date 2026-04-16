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
