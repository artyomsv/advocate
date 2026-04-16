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
