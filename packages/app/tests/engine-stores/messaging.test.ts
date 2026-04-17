import type { AgentId, MessageId } from '@mynah/engine';
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { agentMessages, agents } from '../../src/db/schema.js';
import { DrizzleMessageBus } from '../../src/engine-stores/messaging/drizzle-message-bus.js';

const PREFIX = `msg-test-${Date.now()}`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(agentMessages);
  await db.delete(agents).where(like(agents.name, `${PREFIX}%`));
}

async function seedAgent(suffix: string): Promise<AgentId> {
  const db = getDb();
  const [row] = await db
    .insert(agents)
    .values({
      name: `${PREFIX}-${suffix}`,
      role: 'test',
      soul: 's',
      modelConfig: {},
      memoryConfig: {},
      permissions: [],
    })
    .returning();
  if (!row) throw new Error('agent insert failed');
  return row.id as AgentId;
}

describe('DrizzleMessageBus + DrizzleConversationLog', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('publish persists the message to agent_messages', async () => {
    const bus = new DrizzleMessageBus(getDb());
    const from = await seedAgent('a');
    const to = await seedAgent('b');
    const msg = await bus.publish({
      fromAgent: from,
      toAgent: to,
      type: 'request',
      subject: 'hi',
      content: 'hello',
    });
    expect(msg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(msg.fromAgent).toBe(from);
    expect(msg.toAgent).toBe(to);
  });

  it('subscribers receive messages addressed to their agent', async () => {
    const bus = new DrizzleMessageBus(getDb());
    const from = await seedAgent('a');
    const to = await seedAgent('b');
    let received = 0;
    bus.subscribe(to, async () => {
      received += 1;
    });
    await bus.publish({
      fromAgent: from,
      toAgent: to,
      type: 'request',
      subject: 's',
      content: 'c',
    });
    expect(received).toBe(1);
  });

  it('unsubscribe stops delivery', async () => {
    const bus = new DrizzleMessageBus(getDb());
    const from = await seedAgent('a');
    const to = await seedAgent('b');
    let received = 0;
    const sub = bus.subscribe(to, async () => {
      received += 1;
    });
    expect(bus.unsubscribe(sub)).toBe(true);
    await bus.publish({
      fromAgent: from,
      toAgent: to,
      type: 'request',
      subject: 's',
      content: 'c',
    });
    expect(received).toBe(0);
  });

  it('getThread returns root + reply chain in chronological order', async () => {
    const { DrizzleConversationLog } = await import(
      '../../src/engine-stores/messaging/drizzle-conversation-log.js'
    );
    const log = new DrizzleConversationLog(getDb());
    const from = await seedAgent('a');
    const to = await seedAgent('b');
    const root = await log.append({
      fromAgent: from,
      toAgent: to,
      type: 'request',
      subject: 'root',
      content: 'c',
    });
    const reply = await log.append({
      fromAgent: to,
      toAgent: from,
      type: 'response',
      subject: 'reply',
      content: 'c',
      replyTo: root.id as MessageId,
    });
    const thread = await log.getThread(root.id);
    expect(thread).toHaveLength(2);
    expect(thread[0]!.id).toBe(root.id);
    expect(thread[1]!.id).toBe(reply.id);
  });
});
