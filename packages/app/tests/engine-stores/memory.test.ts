import type { AgentId, IsoTimestamp, MemoryId } from '@mynah/engine';
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  agents,
  consolidatedMemories,
  episodicMemories,
  products,
  relationalMemories,
} from '../../src/db/schema.js';
import { DrizzleEpisodicMemoryStore } from '../../src/engine-stores/memory/drizzle-episodic-store.js';
import { DrizzleRelationalMemoryStore } from '../../src/engine-stores/memory/drizzle-relational-store.js';

const PREFIX = `mem-test-${Date.now()}`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(consolidatedMemories);
  await db.delete(episodicMemories);
  await db.delete(relationalMemories);
  await db.delete(agents).where(like(agents.name, `${PREFIX}%`));
  await db.delete(products).where(like(products.name, `${PREFIX}%`));
}

async function seedAgent(suffix: string): Promise<AgentId> {
  const db = getDb();
  const [row] = await db
    .insert(agents)
    .values({
      name: `${PREFIX}-${suffix}`,
      role: 'test',
      soul: 'test soul',
      modelConfig: {},
      memoryConfig: {},
      permissions: [],
    })
    .returning();
  if (!row) throw new Error('agent insert failed');
  return row.id as AgentId;
}

async function seedProduct(suffix: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .insert(products)
    .values({
      name: `${PREFIX}-${suffix}`,
      slug: `${PREFIX}-${suffix}`.toLowerCase(),
      description: 'test product',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    })
    .returning();
  if (!row) throw new Error('product insert failed');
  return row.id;
}

describe('DrizzleEpisodicMemoryStore', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('records + gets recent in newest-first order', async () => {
    const store = new DrizzleEpisodicMemoryStore(getDb());
    const agentId = await seedAgent('epi1');
    const productId = await seedProduct('p1');
    const a = await store.record({ agentId, productId, action: 'a1', outcome: 'ok' });
    const b = await store.record({ agentId, productId, action: 'a2', outcome: 'ok' });
    const rows = await store.getRecent(agentId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.id).toBe(b.id);
    expect(rows[1]!.id).toBe(a.id);
  });

  it('filters by time range', async () => {
    const store = new DrizzleEpisodicMemoryStore(getDb());
    const agentId = await seedAgent('epi2');
    const productId = await seedProduct('p2');
    const a = await store.record({ agentId, productId, action: 'a', outcome: 'o' });
    const from = new Date(Date.now() - 60_000).toISOString() as IsoTimestamp;
    const to = new Date(Date.now() + 60_000).toISOString() as IsoTimestamp;
    const rows = await store.getBetween(agentId, from, to);
    expect(rows.map((r) => r.id)).toContain(a.id);
  });

  it('deleteBefore removes stale episodes', async () => {
    const store = new DrizzleEpisodicMemoryStore(getDb());
    const agentId = await seedAgent('epi3');
    const productId = await seedProduct('p3');
    await store.record({ agentId, productId, action: 'old', outcome: 'o' });
    // Everything before "now+1s" will match
    const cutoff = new Date(Date.now() + 1000).toISOString() as IsoTimestamp;
    const removed = await store.deleteBefore(agentId, cutoff);
    expect(removed).toBeGreaterThanOrEqual(1);
    const rest = await store.getRecent(agentId);
    expect(rest).toHaveLength(0);
  });

  it('saveConsolidation + getConsolidations round-trip', async () => {
    const store = new DrizzleEpisodicMemoryStore(getDb());
    const agentId = await seedAgent('epi4');
    const now = new Date();
    const later = new Date(now.getTime() + 1000);
    const saved = await store.saveConsolidation({
      agentId,
      sourceEpisodeIds: ['a-b-c' as MemoryId],
      summary: 'summary',
      lessons: ['lesson one'],
      periodFrom: now.toISOString() as IsoTimestamp,
      periodTo: later.toISOString() as IsoTimestamp,
    });
    const list = await store.getConsolidations(agentId);
    expect(list[0]!.id).toBe(saved.id);
    expect(list[0]!.lessons).toEqual(['lesson one']);
  });
});

describe('DrizzleRelationalMemoryStore', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
  });
  beforeEach(cleanup);

  it('upsert creates on first call, increments on subsequent', async () => {
    const store = new DrizzleRelationalMemoryStore(getDb());
    const agentId = await seedAgent('rel1');
    const productId = await seedProduct('rp1');
    const first = await store.upsert({
      agentId,
      productId,
      externalUsername: 'u1',
      platform: 'reddit',
      context: 'ctx',
    });
    expect(first.interactionCount).toBe(1);
    const second = await store.upsert({
      agentId,
      productId,
      externalUsername: 'u1',
      platform: 'reddit',
      context: 'ctx2',
    });
    expect(second.id).toBe(first.id);
    expect(second.interactionCount).toBe(2);
    expect(second.context).toBe('ctx2');
  });

  it('findByUsername returns the row', async () => {
    const store = new DrizzleRelationalMemoryStore(getDb());
    const agentId = await seedAgent('rel2');
    const productId = await seedProduct('rp2');
    await store.upsert({
      agentId,
      productId,
      externalUsername: 'findable',
      platform: 'reddit',
      context: 'x',
    });
    const found = await store.findByUsername(agentId, 'reddit', 'findable');
    expect(found?.externalUsername).toBe('findable');
  });

  it('incrementInteraction bumps the counter', async () => {
    const store = new DrizzleRelationalMemoryStore(getDb());
    const agentId = await seedAgent('rel3');
    const productId = await seedProduct('rp3');
    const r = await store.upsert({
      agentId,
      productId,
      externalUsername: 'u',
      platform: 'reddit',
      context: 'x',
    });
    const after = await store.incrementInteraction(r.id);
    expect(after.interactionCount).toBe(2);
  });
});
