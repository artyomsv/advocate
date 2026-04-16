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
