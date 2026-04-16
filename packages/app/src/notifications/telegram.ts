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
import { Bot } from 'grammy';
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
    `📊 *Daily summary — ${summary.date}*`,
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
    `📈 *Weekly report — ${report.week}*`,
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
    lines.push(
      `• \`${escapeMarkdown(opt.id)}\`${opt.isDefault ? ' (default)' : ''} — ${escapeMarkdown(opt.label)}`,
    );
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
