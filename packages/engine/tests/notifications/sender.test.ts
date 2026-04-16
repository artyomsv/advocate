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
