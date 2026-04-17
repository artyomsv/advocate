import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  AgentMessage,
  MessageBus,
  MessageHandler,
  NewAgentMessage,
  Subscription,
} from '@mynah/engine';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import { DrizzleConversationLog } from './drizzle-conversation-log.js';

interface HandlerEntry {
  readonly subscriptionId: string;
  readonly handler: MessageHandler;
}

/**
 * Persists every message to agent_messages via DrizzleConversationLog, then
 * fans out to in-process subscribers. Subscribers are process-local — a
 * worker handler will only see messages published in the same process. This
 * is sufficient for Mynah today (orchestration is single-process in the
 * worker container) and keeps the bus simple. Cross-process pub-sub can be
 * added later via LISTEN/NOTIFY or Redis.
 */
export class DrizzleMessageBus implements MessageBus {
  readonly #log: DrizzleConversationLog;
  readonly #handlers = new Map<AgentId, HandlerEntry[]>();

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#log = new DrizzleConversationLog(db);
  }

  async publish(input: NewAgentMessage): Promise<AgentMessage> {
    const message = await this.#log.append(input);

    const entries = this.#handlers.get(message.toAgent);
    if (!entries || entries.length === 0) return message;

    for (const entry of entries) {
      try {
        await entry.handler(message);
      } catch {
        // Isolated handler failures must not break the bus.
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
