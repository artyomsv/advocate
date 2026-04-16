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
