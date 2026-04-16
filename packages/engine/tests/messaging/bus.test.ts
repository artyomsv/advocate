import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryMessageBus } from '../../src/messaging/bus.js';
import type { AgentMessage, MessageHandler } from '../../src/messaging/types.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryMessageBus', () => {
  let bus: InMemoryMessageBus;

  beforeEach(() => {
    bus = new InMemoryMessageBus();
  });

  it('publish assigns id + createdAt and returns the materialized message', async () => {
    const msg = await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 'ping',
      content: 'hello',
    });
    expect(msg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(msg.createdAt).toMatch(/^\d{4}-/);
    expect(msg.subject).toBe('ping');
  });

  it('publishing with no subscribers is a no-op (no error)', async () => {
    await expect(
      bus.publish({
        fromAgent: agentA,
        toAgent: agentB,
        type: 'notification',
        subject: 'nobody listening',
        content: 'whisper',
      }),
    ).resolves.toBeDefined();
  });

  it('delivers a message to a subscribed agent handler', async () => {
    const received: AgentMessage[] = [];
    const handler: MessageHandler = (m) => {
      received.push(m);
    };
    bus.subscribe(agentB, handler);

    await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 'q',
      content: 'c',
    });

    expect(received).toHaveLength(1);
    expect(received[0]?.subject).toBe('q');
  });

  it('fan-out: multiple handlers on the same agent each receive the message', async () => {
    let count = 0;
    bus.subscribe(agentB, () => {
      count += 1;
    });
    bus.subscribe(agentB, () => {
      count += 10;
    });
    await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 's',
      content: 'c',
    });
    expect(count).toBe(11);
  });

  it('messages addressed to a different agent do not trigger the handler', async () => {
    let received = 0;
    bus.subscribe(agentB, () => {
      received += 1;
    });
    await bus.publish({
      fromAgent: agentB,
      toAgent: agentA,
      type: 'notification',
      subject: 's',
      content: 'c',
    });
    expect(received).toBe(0);
  });

  it('unsubscribe stops delivery', async () => {
    let count = 0;
    const sub = bus.subscribe(agentB, () => {
      count += 1;
    });
    bus.unsubscribe(sub);
    await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 's',
      content: 'c',
    });
    expect(count).toBe(0);
  });

  it('awaits async handlers before publish resolves', async () => {
    const order: string[] = [];
    bus.subscribe(agentB, async (m) => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(`handled:${m.subject}`);
    });
    await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 'slow',
      content: 'c',
    });
    order.push('after-publish');
    expect(order).toEqual(['handled:slow', 'after-publish']);
  });

  it('a throwing handler does not prevent other handlers from running', async () => {
    let second = 0;
    bus.subscribe(agentB, () => {
      throw new Error('boom');
    });
    bus.subscribe(agentB, () => {
      second += 1;
    });
    // The bus swallows errors (logs them in a real impl) so publish does not reject.
    await bus.publish({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 's',
      content: 'c',
    });
    expect(second).toBe(1);
  });
});
