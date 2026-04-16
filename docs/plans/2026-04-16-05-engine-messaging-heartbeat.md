# Engine Messaging + Heartbeat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the inter-agent messaging contract (bus + conversation log) and the heartbeat scheduler (cron + event triggers), with in-memory reference implementations. The BullMQ-backed runtime implementations arrive in Plan 11 when concrete agents need them; the engine stays dependency-free on Redis.

**Architecture:** Three pure interfaces (`MessageBus`, `ConversationLog`, `HeartbeatScheduler`) paired with in-memory reference implementations. The in-memory scheduler is **registration-only** — it tracks which cron schedules and event handlers exist, but does NOT parse cron strings or fire timers. Actual execution lives in the BullMQ implementation later. This keeps the engine pure, testable in-process, and dependency-free on Redis.

**Tech Stack:** TypeScript ESM · Vitest · uses `node:crypto` for UUIDs · no new runtime dependencies (no cron parser, no pub/sub library)

**Prerequisites:**
- Plan 04 complete (tag `plan04-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/engine/src/
├── messaging/
│   ├── index.ts                     # Messaging barrel
│   ├── types.ts                     # AgentMessage, NewAgentMessage, MessageType, MessageHandler
│   ├── bus.ts                       # MessageBus interface + InMemoryMessageBus
│   └── conversation-log.ts          # ConversationLog interface + InMemoryConversationLog
├── heartbeat/
│   ├── index.ts                     # Heartbeat barrel
│   ├── types.ts                     # CronScheduleInput, EventHandlerInput, Schedule, EventHandler
│   └── scheduler.ts                 # HeartbeatScheduler interface + InMemoryHeartbeatScheduler

packages/engine/tests/
├── messaging/
│   ├── bus.test.ts
│   └── conversation-log.test.ts
└── heartbeat/
    └── scheduler.test.ts
```

## Design decisions

1. **Messaging delivery is synchronous.** `InMemoryMessageBus.publish()` invokes subscriber handlers in order before returning. This is fine for in-process tests and matches what the app's future BullMQ-backed bus will do (enqueue → worker picks up → handler runs). Async semantics can be enforced by handlers that return promises; `publish` awaits them.

2. **ConversationLog is separate from MessageBus.** The bus is transient delivery; the log is the audit trail. In the in-memory case they can share data, but the abstractions are distinct so the DB-backed implementations can have different persistence strategies.

3. **Heartbeat scheduler is registration-only in the engine.** The in-memory impl tracks registrations and exposes them for inspection but does NOT spin timers. Plan 11 wires a BullMQ impl that actually parses cron patterns and fires jobs. This lets us test registration logic exhaustively without Redis or a cron parser.

4. **IDs are uuid v4.** Consistent with all other engine stores. `randomUUID()` from `node:crypto`.

5. **One store, two interfaces for messaging.** The in-memory impls for `MessageBus` and `ConversationLog` are two separate classes in two separate files, each with their own Map. If an application wants one unified implementation (deliver + log in one call), it can compose them.

---

## Task 1: Messaging Types

**Files:**
- Create: `packages/engine/src/messaging/types.ts`

- [ ] **Step 1.1: Create the types file**

```typescript
import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, MessageId, TaskId } from '../types/ids.js';

/**
 * Message kind. Matches the `message_type` enum in the DB schema.
 */
export type MessageType = 'request' | 'response' | 'notification' | 'escalation';

/**
 * A fully-materialized inter-agent message. This is what MessageBus
 * subscribers receive and what ConversationLog persists.
 */
export interface AgentMessage {
  id: MessageId;
  fromAgent: AgentId;
  toAgent: AgentId;
  type: MessageType;
  subject: string;
  content: string;
  /** Message ID being replied to — forms conversation threads. */
  replyTo?: MessageId;
  /** Associated kanban task, when the message pertains to one. */
  taskId?: TaskId;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

/**
 * Input for publishing / logging a new message — the bus/log assign `id`
 * and `createdAt`.
 */
export interface NewAgentMessage {
  fromAgent: AgentId;
  toAgent: AgentId;
  type: MessageType;
  subject: string;
  content: string;
  replyTo?: MessageId;
  taskId?: TaskId;
  metadata?: Record<string, unknown>;
}

/**
 * Handler that receives messages for an agent. Handlers may be async;
 * the bus awaits them before `publish()` returns.
 */
export type MessageHandler = (message: AgentMessage) => void | Promise<void>;

/**
 * Token returned by `subscribe` — pass to `unsubscribe` to detach.
 */
export interface Subscription {
  readonly agentId: AgentId;
  readonly id: string;
}
```

- [ ] **Step 1.2: Typecheck + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/engine typecheck
git add packages/engine/src/messaging/
git commit -m "feat(engine): add messaging domain types (AgentMessage, MessageHandler)"
```

---

## Task 2: MessageBus

**Files:**
- Create: `packages/engine/src/messaging/bus.ts`
- Create: `packages/engine/tests/messaging/bus.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Create `packages/engine/tests/messaging/bus.test.ts`:

```typescript
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
```

- [ ] **Step 2.2: Run test — MUST FAIL**

```bash
mkdir -p packages/engine/tests/messaging
pnpm --filter @advocate/engine test bus.test
```

- [ ] **Step 2.3: Implement `packages/engine/src/messaging/bus.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, MessageId } from '../types/ids.js';
import type { AgentMessage, MessageHandler, NewAgentMessage, Subscription } from './types.js';

/**
 * In-process delivery contract for inter-agent messages. The BullMQ-backed
 * implementation (Plan 11) enqueues messages to per-agent queues and invokes
 * handlers from workers; the semantics are the same from the caller's view.
 */
export interface MessageBus {
  /** Publish a message. Returns the fully-materialized message (with id + createdAt). */
  publish(input: NewAgentMessage): Promise<AgentMessage>;

  /** Register a handler for messages addressed to an agent. */
  subscribe(agentId: AgentId, handler: MessageHandler): Subscription;

  /** Remove a previously registered handler. Returns whether it was found. */
  unsubscribe(subscription: Subscription): boolean;
}

interface HandlerEntry {
  readonly subscriptionId: string;
  readonly handler: MessageHandler;
}

export class InMemoryMessageBus implements MessageBus {
  readonly #handlers = new Map<AgentId, HandlerEntry[]>();

  async publish(input: NewAgentMessage): Promise<AgentMessage> {
    const message: AgentMessage = {
      ...input,
      id: randomUUID() as MessageId,
      createdAt: isoNow(),
    };

    const entries = this.#handlers.get(message.toAgent);
    if (!entries || entries.length === 0) {
      return message;
    }

    // Fan out to every handler. A single handler throwing does not
    // short-circuit delivery to the others; errors are swallowed here and
    // should be logged by the caller's real-world logger.
    for (const entry of entries) {
      try {
        await entry.handler(message);
      } catch {
        // Intentional: isolated handler failures should not break the bus.
      }
    }

    return message;
  }

  subscribe(agentId: AgentId, handler: MessageHandler): Subscription {
    const subscriptionId = randomUUID();
    const list = this.#handlers.get(agentId) ?? [];
    list.push({ subscriptionId, handler });
    this.#handlers.set(agentId, list);
    return { agentId, id: subscriptionId };
  }

  unsubscribe(subscription: Subscription): boolean {
    const list = this.#handlers.get(subscription.agentId);
    if (!list) return false;
    const idx = list.findIndex((e) => e.subscriptionId === subscription.id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    if (list.length === 0) this.#handlers.delete(subscription.agentId);
    return true;
  }
}
```

- [ ] **Step 2.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test bus.test
pnpm lint
git add packages/engine/src/messaging/bus.ts packages/engine/tests/messaging/
git commit -m "feat(engine): add MessageBus with in-memory implementation"
```

---

## Task 3: ConversationLog

**Files:**
- Create: `packages/engine/src/messaging/conversation-log.ts`
- Create: `packages/engine/tests/messaging/conversation-log.test.ts`

- [ ] **Step 3.1: Write failing test FIRST**

Create `packages/engine/tests/messaging/conversation-log.test.ts`:

```typescript
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
```

- [ ] **Step 3.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test conversation-log
```

- [ ] **Step 3.3: Implement `packages/engine/src/messaging/conversation-log.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, MessageId, TaskId } from '../types/ids.js';
import type { AgentMessage, NewAgentMessage } from './types.js';

/**
 * Persistent audit trail of inter-agent messages. The MessageBus delivers;
 * this log remembers. Plan 07 adds the Drizzle-backed implementation via
 * the StorageProvider abstraction.
 */
export interface ConversationLog {
  append(message: NewAgentMessage): Promise<AgentMessage>;
  get(id: MessageId): Promise<AgentMessage | undefined>;
  listByAgent(agentId: AgentId): Promise<readonly AgentMessage[]>;
  listByTask(taskId: TaskId): Promise<readonly AgentMessage[]>;
  /** Root-first, then replies in chronological order (depth-first traversal). */
  getThread(rootId: MessageId): Promise<readonly AgentMessage[]>;
}

export class InMemoryConversationLog implements ConversationLog {
  readonly #messages = new Map<MessageId, AgentMessage>();

  async append(input: NewAgentMessage): Promise<AgentMessage> {
    const message: AgentMessage = {
      ...input,
      id: randomUUID() as MessageId,
      createdAt: isoNow(),
    };
    this.#messages.set(message.id, message);
    return message;
  }

  async get(id: MessageId): Promise<AgentMessage | undefined> {
    return this.#messages.get(id);
  }

  async listByAgent(agentId: AgentId): Promise<readonly AgentMessage[]> {
    return Array.from(this.#messages.values())
      .filter((m) => m.fromAgent === agentId || m.toAgent === agentId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async listByTask(taskId: TaskId): Promise<readonly AgentMessage[]> {
    return Array.from(this.#messages.values())
      .filter((m) => m.taskId === taskId)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async getThread(rootId: MessageId): Promise<readonly AgentMessage[]> {
    const root = this.#messages.get(rootId);
    if (!root) return [];

    // BFS then sort at the end — simpler than maintaining insertion order.
    const all: AgentMessage[] = [root];
    const queue: MessageId[] = [root.id];
    while (queue.length > 0) {
      const parentId = queue.shift();
      if (!parentId) break;
      for (const candidate of this.#messages.values()) {
        if (candidate.replyTo === parentId) {
          all.push(candidate);
          queue.push(candidate.id);
        }
      }
    }
    return all.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }
}
```

- [ ] **Step 3.4: Run test + commit + push**

```bash
pnpm --filter @advocate/engine test conversation-log
pnpm lint
git add packages/engine/src/messaging/conversation-log.ts packages/engine/tests/messaging/conversation-log.test.ts
git commit -m "feat(engine): add ConversationLog with in-memory implementation"
git push origin master
```

---

## Task 4: Heartbeat Types

**Files:**
- Create: `packages/engine/src/heartbeat/types.ts`

- [ ] **Step 4.1: Create the types file**

```typescript
import type { IsoTimestamp } from '../types/common.js';
import type { AgentId } from '../types/ids.js';

/**
 * A scheduled cron trigger. The engine stores the registration; a concrete
 * executor (BullMQ, node-cron) actually fires it on schedule.
 */
export interface CronScheduleInput {
  agentId: AgentId;
  name: string;
  /** Crontab-style pattern (e.g. "*\/15 * * * *"). Parsed + fired by the executor. */
  cronPattern: string;
  /** Opaque job identifier the runtime uses to dispatch the trigger to an agent method. */
  jobType: string;
  jobData?: Record<string, unknown>;
}

export interface Schedule {
  id: string;
  agentId: AgentId;
  name: string;
  cronPattern: string;
  jobType: string;
  jobData?: Record<string, unknown>;
  enabled: boolean;
  lastRunAt?: IsoTimestamp;
  nextRunAt?: IsoTimestamp;
  createdAt: IsoTimestamp;
}

/**
 * An event-driven trigger. Unlike cron, these fire in response to named
 * events (e.g. "content.draft.ready"). Multiple handlers can register for
 * the same event name.
 */
export interface EventHandlerInput {
  agentId: AgentId;
  eventName: string;
  jobType: string;
}

export interface EventHandler {
  id: string;
  agentId: AgentId;
  eventName: string;
  jobType: string;
  createdAt: IsoTimestamp;
}
```

- [ ] **Step 4.2: Typecheck + commit**

```bash
pnpm --filter @advocate/engine typecheck
git add packages/engine/src/heartbeat/
git commit -m "feat(engine): add heartbeat domain types (Schedule, EventHandler)"
```

---

## Task 5: Heartbeat Scheduler

**Files:**
- Create: `packages/engine/src/heartbeat/scheduler.ts`
- Create: `packages/engine/tests/heartbeat/scheduler.test.ts`

- [ ] **Step 5.1: Write failing test FIRST**

Create `packages/engine/tests/heartbeat/scheduler.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryHeartbeatScheduler } from '../../src/heartbeat/scheduler.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryHeartbeatScheduler', () => {
  let scheduler: InMemoryHeartbeatScheduler;

  beforeEach(() => {
    scheduler = new InMemoryHeartbeatScheduler();
  });

  it('registerCron creates a schedule with id + createdAt + enabled:true', async () => {
    const schedule = await scheduler.registerCron({
      agentId: agentA,
      name: 'scout-poll',
      cronPattern: '*/15 * * * *',
      jobType: 'scout.poll',
    });
    expect(schedule.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(schedule.createdAt).toMatch(/^\d{4}-/);
    expect(schedule.enabled).toBe(true);
    expect(schedule.cronPattern).toBe('*/15 * * * *');
  });

  it('listSchedules returns all when no agent filter; filters when provided', async () => {
    await scheduler.registerCron({
      agentId: agentA,
      name: 's1',
      cronPattern: '0 * * * *',
      jobType: 'j1',
    });
    await scheduler.registerCron({
      agentId: agentB,
      name: 's2',
      cronPattern: '0 0 * * *',
      jobType: 'j2',
    });
    expect(await scheduler.listSchedules()).toHaveLength(2);
    expect(await scheduler.listSchedules(agentA)).toHaveLength(1);
    expect((await scheduler.listSchedules(agentA))[0]?.name).toBe('s1');
  });

  it('unregisterCron removes + returns true; repeated returns false', async () => {
    const s = await scheduler.registerCron({
      agentId: agentA,
      name: 's',
      cronPattern: '* * * * *',
      jobType: 'j',
    });
    expect(await scheduler.unregisterCron(s.id)).toBe(true);
    expect(await scheduler.listSchedules()).toHaveLength(0);
    expect(await scheduler.unregisterCron(s.id)).toBe(false);
  });

  it('disable/enable toggle the enabled flag without removing the schedule', async () => {
    const s = await scheduler.registerCron({
      agentId: agentA,
      name: 's',
      cronPattern: '* * * * *',
      jobType: 'j',
    });
    const disabled = await scheduler.disableSchedule(s.id);
    expect(disabled.enabled).toBe(false);
    const enabled = await scheduler.enableSchedule(s.id);
    expect(enabled.enabled).toBe(true);
  });

  it('disable/enable on unknown id throws', async () => {
    await expect(scheduler.disableSchedule(randomUUID())).rejects.toThrow(/not found/);
    await expect(scheduler.enableSchedule(randomUUID())).rejects.toThrow(/not found/);
  });

  it('registerEvent creates a handler with id + createdAt', async () => {
    const handler = await scheduler.registerEvent({
      agentId: agentA,
      eventName: 'content.draft.ready',
      jobType: 'quality.review',
    });
    expect(handler.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(handler.eventName).toBe('content.draft.ready');
  });

  it('listEventHandlers returns all or filters by eventName', async () => {
    await scheduler.registerEvent({
      agentId: agentA,
      eventName: 'content.draft.ready',
      jobType: 'quality.review',
    });
    await scheduler.registerEvent({
      agentId: agentB,
      eventName: 'content.draft.ready',
      jobType: 'strategy.followup',
    });
    await scheduler.registerEvent({
      agentId: agentA,
      eventName: 'post.removed',
      jobType: 'safety.escalate',
    });

    expect(await scheduler.listEventHandlers()).toHaveLength(3);
    expect(await scheduler.listEventHandlers('content.draft.ready')).toHaveLength(2);
    expect(await scheduler.listEventHandlers('nope')).toHaveLength(0);
  });

  it('unregisterEvent removes + returns true; repeated returns false', async () => {
    const h = await scheduler.registerEvent({
      agentId: agentA,
      eventName: 'e',
      jobType: 'j',
    });
    expect(await scheduler.unregisterEvent(h.id)).toBe(true);
    expect(await scheduler.listEventHandlers()).toHaveLength(0);
    expect(await scheduler.unregisterEvent(h.id)).toBe(false);
  });

  it('rejects empty cronPattern', async () => {
    await expect(
      scheduler.registerCron({
        agentId: agentA,
        name: 's',
        cronPattern: '',
        jobType: 'j',
      }),
    ).rejects.toThrow(/pattern/i);
  });

  it('rejects empty eventName', async () => {
    await expect(
      scheduler.registerEvent({
        agentId: agentA,
        eventName: '',
        jobType: 'j',
      }),
    ).rejects.toThrow(/eventName/i);
  });
});
```

- [ ] **Step 5.2: Run test — MUST FAIL**

```bash
mkdir -p packages/engine/tests/heartbeat
pnpm --filter @advocate/engine test scheduler
```

- [ ] **Step 5.3: Implement `packages/engine/src/heartbeat/scheduler.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId } from '../types/ids.js';
import type {
  CronScheduleInput,
  EventHandler,
  EventHandlerInput,
  Schedule,
} from './types.js';

/**
 * Contract for the heartbeat scheduler. The engine's in-memory
 * implementation is registration-only — it tracks cron schedules and
 * event handlers but does NOT parse cron strings or fire timers. Plan 11
 * provides a BullMQ-backed implementation that actually runs schedules.
 */
export interface HeartbeatScheduler {
  registerCron(input: CronScheduleInput): Promise<Schedule>;
  unregisterCron(scheduleId: string): Promise<boolean>;
  listSchedules(agentId?: AgentId): Promise<readonly Schedule[]>;
  enableSchedule(scheduleId: string): Promise<Schedule>;
  disableSchedule(scheduleId: string): Promise<Schedule>;

  registerEvent(input: EventHandlerInput): Promise<EventHandler>;
  unregisterEvent(handlerId: string): Promise<boolean>;
  listEventHandlers(eventName?: string): Promise<readonly EventHandler[]>;
}

export class InMemoryHeartbeatScheduler implements HeartbeatScheduler {
  readonly #schedules = new Map<string, Schedule>();
  readonly #events = new Map<string, EventHandler>();

  async registerCron(input: CronScheduleInput): Promise<Schedule> {
    if (input.cronPattern.trim().length === 0) {
      throw new Error('cronPattern must be non-empty');
    }
    const schedule: Schedule = {
      ...input,
      id: randomUUID(),
      enabled: true,
      createdAt: isoNow(),
    };
    this.#schedules.set(schedule.id, schedule);
    return schedule;
  }

  async unregisterCron(scheduleId: string): Promise<boolean> {
    return this.#schedules.delete(scheduleId);
  }

  async listSchedules(agentId?: AgentId): Promise<readonly Schedule[]> {
    const all = Array.from(this.#schedules.values());
    return agentId ? all.filter((s) => s.agentId === agentId) : all;
  }

  async enableSchedule(scheduleId: string): Promise<Schedule> {
    const schedule = this.#mustGetSchedule(scheduleId);
    const updated: Schedule = { ...schedule, enabled: true };
    this.#schedules.set(scheduleId, updated);
    return updated;
  }

  async disableSchedule(scheduleId: string): Promise<Schedule> {
    const schedule = this.#mustGetSchedule(scheduleId);
    const updated: Schedule = { ...schedule, enabled: false };
    this.#schedules.set(scheduleId, updated);
    return updated;
  }

  async registerEvent(input: EventHandlerInput): Promise<EventHandler> {
    if (input.eventName.trim().length === 0) {
      throw new Error('eventName must be non-empty');
    }
    const handler: EventHandler = {
      ...input,
      id: randomUUID(),
      createdAt: isoNow(),
    };
    this.#events.set(handler.id, handler);
    return handler;
  }

  async unregisterEvent(handlerId: string): Promise<boolean> {
    return this.#events.delete(handlerId);
  }

  async listEventHandlers(eventName?: string): Promise<readonly EventHandler[]> {
    const all = Array.from(this.#events.values());
    return eventName ? all.filter((h) => h.eventName === eventName) : all;
  }

  #mustGetSchedule(id: string): Schedule {
    const schedule = this.#schedules.get(id);
    if (!schedule) throw new Error(`Schedule ${id} not found`);
    return schedule;
  }
}
```

- [ ] **Step 5.4: Run test + commit + push**

```bash
pnpm --filter @advocate/engine test scheduler
pnpm lint
git add packages/engine/src/heartbeat/scheduler.ts packages/engine/tests/heartbeat/
git commit -m "feat(engine): add HeartbeatScheduler with registration-only in-memory impl"
git push origin master
```

---

## Task 6: Barrel Updates

**Files:**
- Create: `packages/engine/src/messaging/index.ts`
- Create: `packages/engine/src/heartbeat/index.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 6.1: Create messaging barrel**

`packages/engine/src/messaging/index.ts`:

```typescript
export * from './bus.js';
export * from './conversation-log.js';
export * from './types.js';
```

- [ ] **Step 6.2: Create heartbeat barrel**

`packages/engine/src/heartbeat/index.ts`:

```typescript
export * from './scheduler.js';
export * from './types.js';
```

- [ ] **Step 6.3: Extend public barrel `packages/engine/src/index.ts`**

Add these new exports (Biome will alphabetize on save):

```typescript
// Messaging
export { InMemoryMessageBus, type MessageBus } from './messaging/bus.js';
export {
  InMemoryConversationLog,
  type ConversationLog,
} from './messaging/conversation-log.js';
export type {
  AgentMessage,
  MessageHandler,
  MessageType,
  NewAgentMessage,
  Subscription,
} from './messaging/types.js';

// Heartbeat
export {
  InMemoryHeartbeatScheduler,
  type HeartbeatScheduler,
} from './heartbeat/scheduler.js';
export type {
  CronScheduleInput,
  EventHandler,
  EventHandlerInput,
  Schedule,
} from './heartbeat/types.js';
```

- [ ] **Step 6.4: Verify full suite + commit + push**

```bash
pnpm --filter @advocate/engine typecheck
pnpm --filter @advocate/engine build
pnpm --filter @advocate/engine test
pnpm lint
git add packages/engine/src/
git commit -m "feat(engine): expose messaging + heartbeat via public barrel"
git push origin master
```

Expected: engine now ~80 tests passing (57 prior + ~8 bus + ~7 conversation-log + ~10 scheduler).

---

## Task 7: Docker Round-Trip + Tag

- [ ] **Step 7.1: Rebuild and boot the full stack**

```bash
docker compose down
docker compose up -d --build
```

- [ ] **Step 7.2: Wait for API health**

```bash
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
echo "API healthy"
```

- [ ] **Step 7.3: Verify**

```bash
docker compose ps
curl -s http://localhost:36401/health
```

Must return `{"status":"ok","checks":{"database":true,"redis":true}}`.

- [ ] **Step 7.4: Stop stack + tag**

```bash
docker compose down
git tag -a plan05-complete -m "Plan 05 Engine Messaging + Heartbeat complete"
git push origin plan05-complete
```

---

## Acceptance Criteria

1. ✅ MessageBus + InMemoryMessageBus shipped with tests
2. ✅ ConversationLog + InMemoryConversationLog shipped with tests
3. ✅ HeartbeatScheduler + InMemoryHeartbeatScheduler shipped with tests
4. ✅ All new interfaces + reference impls exported via public barrel
5. ✅ `pnpm verify` passes
6. ✅ Docker stack boots healthy, `/health` returns ok
7. ✅ Tag `plan05-complete` pushed to origin

## Out of Scope

- BullMQ-backed MessageBus → Plan 11 (when agents actually need durable messaging)
- BullMQ-backed HeartbeatScheduler → Plan 11
- Concrete `AgentRuntime` implementation tying messaging + heartbeat + role dispatch → Plan 11
- LLM router + provider wiring → Plan 06
- Notifications (Telegram) → Plan 07
- Storage abstraction → Plan 07

---

**End of Plan 05 (Engine: Messaging + Heartbeat).**
