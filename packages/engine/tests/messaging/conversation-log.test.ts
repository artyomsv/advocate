import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryConversationLog } from '../../src/messaging/conversation-log.js';
import type { AgentId, MessageId, TaskId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;
const agentC = randomUUID() as AgentId;
const taskX = randomUUID() as TaskId;

describe('InMemoryConversationLog', () => {
  let log: InMemoryConversationLog;

  beforeEach(() => {
    log = new InMemoryConversationLog();
  });

  it('append assigns id + createdAt and returns the materialized message', async () => {
    const msg = await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 's',
      content: 'c',
    });
    expect(msg.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(msg.createdAt).toMatch(/^\d{4}-/);
  });

  it('get returns by id; undefined if missing', async () => {
    const msg = await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 's',
      content: 'c',
    });
    expect((await log.get(msg.id))?.id).toBe(msg.id);
    expect(await log.get(randomUUID() as MessageId)).toBeUndefined();
  });

  it('listByAgent returns messages to OR from the agent', async () => {
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 's1',
      content: 'c',
    });
    await log.append({
      fromAgent: agentB,
      toAgent: agentA,
      type: 'response',
      subject: 's2',
      content: 'c',
    });
    await log.append({
      fromAgent: agentC,
      toAgent: agentC,
      type: 'notification',
      subject: 's3',
      content: 'c',
    });

    const forA = await log.listByAgent(agentA);
    expect(forA).toHaveLength(2);
    expect(forA.map((m) => m.subject).sort()).toEqual(['s1', 's2']);
  });

  it('listByTask returns only messages for that task', async () => {
    const otherTask = randomUUID() as TaskId;
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 'on-task',
      content: 'c',
      taskId: taskX,
    });
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 'off-task',
      content: 'c',
    });
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 'other-task',
      content: 'c',
      taskId: otherTask,
    });

    const onX = await log.listByTask(taskX);
    expect(onX).toHaveLength(1);
    expect(onX[0]?.subject).toBe('on-task');
  });

  it('getThread returns the root + all replies (recursively) in chronological order', async () => {
    const root = await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'request',
      subject: 'root',
      content: 'c',
    });
    // Two direct replies
    const reply1 = await log.append({
      fromAgent: agentB,
      toAgent: agentA,
      type: 'response',
      subject: 'reply1',
      content: 'c',
      replyTo: root.id,
    });
    const reply2 = await log.append({
      fromAgent: agentB,
      toAgent: agentA,
      type: 'response',
      subject: 'reply2',
      content: 'c',
      replyTo: root.id,
    });
    // One nested reply
    const nested = await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'response',
      subject: 'nested',
      content: 'c',
      replyTo: reply1.id,
    });

    const thread = await log.getThread(root.id);
    expect(thread.map((m) => m.subject)).toEqual(['root', 'reply1', 'reply2', 'nested']);
  });

  it('getThread for an unknown root returns empty', async () => {
    const thread = await log.getThread(randomUUID() as MessageId);
    expect(thread).toEqual([]);
  });

  it('listByAgent ordered oldest-first', async () => {
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 'first',
      content: 'c',
    });
    await new Promise((r) => setTimeout(r, 3));
    await log.append({
      fromAgent: agentA,
      toAgent: agentB,
      type: 'notification',
      subject: 'second',
      content: 'c',
    });
    const list = await log.listByAgent(agentA);
    expect(list[0]?.subject).toBe('first');
    expect(list[1]?.subject).toBe('second');
  });
});
