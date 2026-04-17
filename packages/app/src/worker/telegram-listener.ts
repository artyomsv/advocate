import { Bot } from 'grammy';
import type pino from 'pino';
import type { ContentPlanService } from '../content-plans/content-plan.service.js';
import { decodeCallback } from '../notifications/telegram-inline.js';

export interface TelegramListenerDeps {
  botToken: string;
  service: ContentPlanService;
  logger: pino.Logger;
}

export interface TelegramListener {
  start: () => void;
  stop: () => Promise<void>;
}

export function createTelegramListener(deps: TelegramListenerDeps): TelegramListener {
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
