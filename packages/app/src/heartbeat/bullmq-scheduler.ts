import type { AgentId, IsoTimestamp, Schedule } from '@mynah/engine';
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { childLogger } from '../config/logger.js';

const log = childLogger('heartbeat.bullmq');

export interface RegisterCronInput {
  agentId: AgentId;
  name: string;
  queueName: string;
  cronPattern: string;
  jobType: string;
  jobData?: Record<string, unknown>;
}

export class BullMQHeartbeatScheduler {
  readonly #connection: Redis;
  readonly #queues = new Map<string, Queue>();

  constructor(connection: Redis) {
    this.#connection = connection;
  }

  async registerCron(input: RegisterCronInput): Promise<Schedule> {
    if (input.cronPattern.trim().length === 0) {
      throw new Error('cronPattern must be non-empty');
    }
    const queue = this.#getQueue(input.queueName);

    // BullMQ job-scheduler ID uniquely identifies a recurring schedule.
    // Using `${agentId}:${name}` gives us a deterministic key for idempotent re-registration.
    const id = `${input.agentId}:${input.name}`;
    await queue.upsertJobScheduler(
      id,
      { pattern: input.cronPattern },
      {
        name: input.jobType,
        data: { ...input.jobData, scheduleName: input.name },
      },
    );

    log.info({ id, pattern: input.cronPattern, queue: input.queueName }, 'scheduled cron');

    const now = new Date().toISOString() as IsoTimestamp;
    return {
      id,
      agentId: input.agentId,
      name: input.name,
      cronPattern: input.cronPattern,
      jobType: input.jobType,
      jobData: input.jobData,
      enabled: true,
      createdAt: now,
    };
  }

  async unregisterCron(queueName: string, scheduleId: string): Promise<boolean> {
    const queue = this.#getQueue(queueName);
    return queue.removeJobScheduler(scheduleId);
  }

  async listSchedules(queueName: string): Promise<readonly Schedule[]> {
    const queue = this.#getQueue(queueName);
    const schedulers = await queue.getJobSchedulers();
    return schedulers.map((s) => {
      const colonIdx = s.key.indexOf(':');
      const agentId = colonIdx >= 0 ? s.key.slice(0, colonIdx) : s.key;
      const name = colonIdx >= 0 ? s.key.slice(colonIdx + 1) : '';
      return {
        id: s.key,
        agentId: agentId as AgentId,
        name,
        cronPattern: s.pattern ?? '',
        jobType: s.name,
        jobData: s.template?.data as Record<string, unknown> | undefined,
        enabled: true,
        createdAt: new Date(s.next ?? Date.now()).toISOString() as IsoTimestamp,
        nextRunAt: s.next ? (new Date(s.next).toISOString() as IsoTimestamp) : undefined,
      };
    });
  }

  async close(): Promise<void> {
    for (const queue of this.#queues.values()) {
      await queue.close();
    }
    this.#queues.clear();
  }

  #getQueue(name: string): Queue {
    let queue = this.#queues.get(name);
    if (!queue) {
      queue = new Queue(name, { connection: this.#connection });
      this.#queues.set(name, queue);
    }
    return queue;
  }
}
