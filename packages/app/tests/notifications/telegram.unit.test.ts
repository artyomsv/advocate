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
