import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId } from '../types/ids.js';
import type { CronScheduleInput, EventHandler, EventHandlerInput, Schedule } from './types.js';

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
