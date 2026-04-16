import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NaiveMemoryConsolidator } from '../../src/memory/consolidator.js';
import { InMemoryEpisodicStore } from '../../src/memory/episodic-store.js';
import type { IsoTimestamp } from '../../src/types/common.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;

describe('NaiveMemoryConsolidator', () => {
  let store: InMemoryEpisodicStore;
  let consolidator: NaiveMemoryConsolidator;

  beforeEach(() => {
    store = new InMemoryEpisodicStore();
    consolidator = new NaiveMemoryConsolidator(store);
  });

  it('is a no-op when fewer episodes than minEpisodes match', async () => {
    await store.record({ agentId: agentA, action: 'a', outcome: 'o' });
    const result = await consolidator.consolidate(agentA, {
      olderThan: new Date(Date.now() + 10_000).toISOString() as IsoTimestamp,
      minEpisodes: 5,
    });
    expect(result.consolidation).toBeUndefined();
    expect(result.episodesRemoved).toBe(0);

    // Episode is still there.
    expect((await store.getRecent(agentA)).length).toBe(1);
  });

  it('is a no-op when there are zero candidate episodes', async () => {
    const result = await consolidator.consolidate(agentA, {
      olderThan: new Date().toISOString() as IsoTimestamp,
    });
    expect(result.consolidation).toBeUndefined();
    expect(result.episodesRemoved).toBe(0);
  });

  it('consolidates qualifying old episodes, deletes them, keeps newer ones', async () => {
    const old1 = await store.record({
      agentId: agentA,
      action: 'commented on r/Plumbing',
      outcome: '12 upvotes',
      lesson: 'specific prices resonate',
    });
    await new Promise((r) => setTimeout(r, 5));
    const old2 = await store.record({
      agentId: agentA,
      action: 'posted to r/HVAC',
      outcome: '5 upvotes',
    });
    await new Promise((r) => setTimeout(r, 10));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    await new Promise((r) => setTimeout(r, 10));
    const keep = await store.record({ agentId: agentA, action: 'newer', outcome: 'recent' });

    const result = await consolidator.consolidate(agentA, {
      olderThan: cutoff,
      minEpisodes: 2,
    });

    expect(result.episodesRemoved).toBe(2);
    expect(result.consolidation).toBeDefined();
    expect(result.consolidation?.sourceEpisodeIds).toEqual(
      expect.arrayContaining([old1.id, old2.id]),
    );
    expect(result.consolidation?.summary).toContain('r/Plumbing');
    expect(result.consolidation?.lessons).toContain('specific prices resonate');

    // Source episodes gone
    expect(await store.get(old1.id)).toBeUndefined();
    expect(await store.get(old2.id)).toBeUndefined();
    // Newer preserved
    expect((await store.get(keep.id))?.id).toBe(keep.id);
    // Consolidation persisted
    const saved = await store.getConsolidations(agentA);
    expect(saved).toHaveLength(1);
  });

  it('applies the default minEpisodes of 1 when not provided', async () => {
    await store.record({ agentId: agentA, action: 'solo', outcome: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    const result = await consolidator.consolidate(agentA, { olderThan: cutoff });
    expect(result.episodesRemoved).toBe(1);
    expect(result.consolidation).toBeDefined();
  });
});
