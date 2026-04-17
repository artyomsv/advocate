import type { AgentId } from '@mynah/engine';
import { Queue } from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { BullMQHeartbeatScheduler } from '../../src/heartbeat/bullmq-scheduler.js';
import { closeRedis, getRedis } from '../../src/queue/connection.js';

const TEST_QUEUE = 'heartbeat-test-queue';

describe('BullMQHeartbeatScheduler (integration)', () => {
  let queue: Queue;
  let scheduler: BullMQHeartbeatScheduler;

  beforeAll(async () => {
    const connection = getRedis();
    queue = new Queue(TEST_QUEUE, { connection });
    scheduler = new BullMQHeartbeatScheduler(getRedis());
  });

  afterAll(async () => {
    await scheduler.close();
    await queue.drain();
    await queue.obliterate({ force: true });
    await queue.close();
    await closeRedis();
  });

  afterEach(async () => {
    const redis = getRedis();
    const keys = await redis.keys('bull:*');
    if (keys.length > 0) await redis.del(keys);
  });

  it('registerCron creates a schedule with id + createdAt + enabled', async () => {
    const schedule = await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'test-cron',
      queueName: TEST_QUEUE,
      cronPattern: '*/5 * * * *',
      jobType: 'test.poll',
      jobData: { x: 1 },
    });
    expect(schedule.id).toMatch(/.+/);
    expect(schedule.enabled).toBe(true);
    expect(schedule.cronPattern).toBe('*/5 * * * *');
  });

  it('listSchedules returns all schedules for the queue', async () => {
    await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'a',
      queueName: TEST_QUEUE,
      cronPattern: '0 * * * *',
      jobType: 'j1',
    });
    await scheduler.registerCron({
      agentId: '22222222-2222-4222-8222-222222222222' as AgentId,
      name: 'b',
      queueName: TEST_QUEUE,
      cronPattern: '0 0 * * *',
      jobType: 'j2',
    });
    const list = await scheduler.listSchedules(TEST_QUEUE);
    expect(list.length).toBeGreaterThanOrEqual(2);
  });

  it('unregisterCron removes a schedule', async () => {
    const s = await scheduler.registerCron({
      agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
      name: 'to-remove',
      queueName: TEST_QUEUE,
      cronPattern: '* * * * *',
      jobType: 'j',
    });
    expect(await scheduler.unregisterCron(TEST_QUEUE, s.id)).toBe(true);
    // Unregistering again should be a no-op, returning false.
    expect(await scheduler.unregisterCron(TEST_QUEUE, s.id)).toBe(false);
  });

  it('rejects empty cron pattern', async () => {
    await expect(
      scheduler.registerCron({
        agentId: '11111111-1111-4111-8111-111111111111' as AgentId,
        name: 'x',
        queueName: TEST_QUEUE,
        cronPattern: '',
        jobType: 'j',
      }),
    ).rejects.toThrow(/cronPattern/i);
  });
});
