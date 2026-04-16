import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEpisodicStore } from '../../src/memory/episodic-store.js';
import type { IsoTimestamp } from '../../src/types/common.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryEpisodicStore', () => {
  let store: InMemoryEpisodicStore;

  beforeEach(() => {
    store = new InMemoryEpisodicStore();
  });

  it('records an episode with assigned id, createdAt, default sentiment', async () => {
    const ep = await store.record({
      agentId: agentA,
      action: 'commented on r/Plumbing thread',
      outcome: '12 upvotes',
    });
    expect(ep.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ep.sentiment).toBe('neutral');
    expect(ep.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ep.agentId).toBe(agentA);
  });

  it('preserves explicit sentiment, lesson, context, metadata', async () => {
    const ep = await store.record({
      agentId: agentA,
      action: 'posted',
      outcome: 'removed by mod',
      sentiment: 'negative',
      lesson: 'avoid r/X — strict no-promo rule',
      context: { platform: 'reddit', community: 'r/X' },
      metadata: { modAction: 'remove' },
    });
    expect(ep.sentiment).toBe('negative');
    expect(ep.lesson).toContain('no-promo');
    expect(ep.context).toEqual({ platform: 'reddit', community: 'r/X' });
    expect(ep.metadata).toEqual({ modAction: 'remove' });
  });

  it('getRecent returns latest-first bounded by limit', async () => {
    for (let i = 0; i < 5; i++) {
      await store.record({ agentId: agentA, action: `a${i}`, outcome: `o${i}` });
    }
    const recent = await store.getRecent(agentA, 3);
    expect(recent).toHaveLength(3);
    // Latest-first: a4 before a3 before a2
    expect(recent[0]?.action).toBe('a4');
    expect(recent[2]?.action).toBe('a2');
  });

  it('getRecent defaults to 50 when limit omitted', async () => {
    for (let i = 0; i < 60; i++) {
      await store.record({ agentId: agentA, action: `a${i}`, outcome: `o${i}` });
    }
    const recent = await store.getRecent(agentA);
    expect(recent).toHaveLength(50);
  });

  it('scopes getRecent to agent', async () => {
    await store.record({ agentId: agentA, action: 'a-a', outcome: 'oa' });
    await store.record({ agentId: agentB, action: 'b-a', outcome: 'ob' });
    const a = await store.getRecent(agentA);
    expect(a).toHaveLength(1);
    expect(a[0]?.action).toBe('a-a');
  });

  it('getBetween filters inclusive on both ends', async () => {
    const ep1 = await store.record({ agentId: agentA, action: 'a1', outcome: 'o1' });
    // Record another; brief gap
    await new Promise((r) => setTimeout(r, 5));
    const ep2 = await store.record({ agentId: agentA, action: 'a2', outcome: 'o2' });
    const within = await store.getBetween(agentA, ep1.createdAt, ep2.createdAt);
    expect(within.length).toBe(2);
  });

  it('get returns the episode by id; undefined if missing', async () => {
    const ep = await store.record({ agentId: agentA, action: 'x', outcome: 'y' });
    const found = await store.get(ep.id);
    expect(found?.id).toBe(ep.id);
    const missing = await store.get(randomUUID() as (typeof ep)['id']);
    expect(missing).toBeUndefined();
  });

  it('deleteBefore removes only episodes older than the cutoff and only for that agent', async () => {
    const old = await store.record({ agentId: agentA, action: 'old', outcome: 'o' });
    await new Promise((r) => setTimeout(r, 10));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    await new Promise((r) => setTimeout(r, 10));
    await store.record({ agentId: agentA, action: 'new', outcome: 'o' });
    await store.record({ agentId: agentB, action: 'other-agent-old', outcome: 'o' });

    const removed = await store.deleteBefore(agentA, cutoff);
    expect(removed).toBe(1);
    expect(await store.get(old.id)).toBeUndefined();
    // Other agent's episodes untouched
    const b = await store.getRecent(agentB);
    expect(b).toHaveLength(1);
  });

  it('saveConsolidation + getConsolidations round-trip', async () => {
    const consolidation = await store.saveConsolidation({
      agentId: agentA,
      sourceEpisodeIds: [],
      summary: 'Handled 3 threads',
      lessons: ['be concise'],
      periodFrom: new Date('2026-04-01').toISOString() as IsoTimestamp,
      periodTo: new Date('2026-04-07').toISOString() as IsoTimestamp,
    });
    expect(consolidation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(consolidation.consolidatedAt).toMatch(/^\d{4}-/);
    const list = await store.getConsolidations(agentA);
    expect(list).toHaveLength(1);
    expect(list[0]?.summary).toBe('Handled 3 threads');
  });

  it('getConsolidations returns latest-first and respects limit', async () => {
    for (let i = 0; i < 4; i++) {
      await store.saveConsolidation({
        agentId: agentA,
        sourceEpisodeIds: [],
        summary: `summary-${i}`,
        lessons: [],
        periodFrom: new Date().toISOString() as IsoTimestamp,
        periodTo: new Date().toISOString() as IsoTimestamp,
      });
    }
    const list = await store.getConsolidations(agentA, 2);
    expect(list).toHaveLength(2);
    expect(list[0]?.summary).toBe('summary-3');
  });
});
