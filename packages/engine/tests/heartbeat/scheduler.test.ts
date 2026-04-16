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
