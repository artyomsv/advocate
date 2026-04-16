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
