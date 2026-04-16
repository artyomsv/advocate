import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRelationalStore } from '../../src/memory/relational-store.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryRelationalStore', () => {
  let store: InMemoryRelationalStore;

  beforeEach(() => {
    store = new InMemoryRelationalStore();
  });

  it('upsert creates a new relationship with defaults', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'replied to my PEX thread',
    });
    expect(rel.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rel.sentiment).toBe('neutral');
    expect(rel.interactionCount).toBe(1);
    expect(rel.tags).toEqual([]);
    expect(rel.lastInteractionAt).toMatch(/^\d{4}-/);
  });

  it('upsert on the same (agent, platform, username) updates, not duplicates', async () => {
    const first = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'first meeting',
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'second interaction',
      sentiment: 'positive',
    });
    expect(second.id).toBe(first.id);
    expect(second.interactionCount).toBe(2);
    expect(second.sentiment).toBe('positive');
    expect(second.context).toBe('second interaction');
    expect(second.lastInteractionAt >= first.lastInteractionAt).toBe(true);

    const all = await store.listForAgent(agentA);
    expect(all).toHaveLength(1);
  });

  it('the same username under a different platform is a different relationship', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'reddit',
    });
    await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'twitter',
      context: 'twitter',
    });
    const all = await store.listForAgent(agentA);
    expect(all).toHaveLength(2);
  });

  it('relationships are scoped per agent', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    await store.upsert({
      agentId: agentB,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    expect(await store.listForAgent(agentA)).toHaveLength(1);
    expect(await store.listForAgent(agentB)).toHaveLength(1);
  });

  it('findByUsername returns the right row or undefined', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    const found = await store.findByUsername(agentA, 'reddit', 'u');
    expect(found?.externalUsername).toBe('u');
    expect(await store.findByUsername(agentA, 'reddit', 'missing')).toBeUndefined();
  });

  it('updateSentiment changes only the sentiment field', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: 'x',
    });
    const updated = await store.updateSentiment(rel.id, 'negative');
    expect(updated.sentiment).toBe('negative');
    expect(updated.context).toBe('x');
    expect(updated.interactionCount).toBe(1);
  });

  it('incrementInteraction bumps count + lastInteractionAt', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    await new Promise((r) => setTimeout(r, 5));
    const bumped = await store.incrementInteraction(rel.id);
    expect(bumped.interactionCount).toBe(2);
    expect(bumped.lastInteractionAt >= rel.lastInteractionAt).toBe(true);
  });

  it('updateSentiment on unknown id throws', async () => {
    await expect(
      store.updateSentiment(randomUUID() as typeof agentA & { __brand: 'MemoryId' }, 'positive'),
    ).rejects.toThrow(/not found/);
  });
});
