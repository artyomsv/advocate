import { pgEnum } from 'drizzle-orm/pg-core';

export const agentStateEnum = pgEnum('agent_state', [
  'idle',
  'working',
  'waiting_approval',
  'sleeping',
  'stopped',
]);

export const taskPriorityEnum = pgEnum('task_priority', ['critical', 'high', 'medium', 'low']);

export const taskStatusEnum = pgEnum('task_status', [
  'backlog',
  'in_progress',
  'in_review',
  'approved',
  'done',
  'blocked',
]);

export const messageTypeEnum = pgEnum('message_type', [
  'request',
  'response',
  'notification',
  'escalation',
]);

export const sentimentEnum = pgEnum('sentiment', ['positive', 'neutral', 'negative']);

export const memoryConsolidationEnum = pgEnum('memory_consolidation_type', ['raw', 'consolidated']);

export const safetyEventTypeEnum = pgEnum('safety_event_type', [
  'rate_limit_hit',
  'content_rejected',
  'account_warned',
  'account_suspended',
  'kill_switch_activated',
]);
