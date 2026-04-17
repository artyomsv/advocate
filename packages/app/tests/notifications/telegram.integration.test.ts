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
      subject: 'Mynah integration test',
      details: 'If you see this, TelegramNotifier works end-to-end. Safe to delete.',
    });
    expect(result.providerId).toBe('telegram');
    expect(result.providerMessageId).toMatch(/^\d+$/); // Telegram message IDs are numeric strings
  }, 30_000);
});
