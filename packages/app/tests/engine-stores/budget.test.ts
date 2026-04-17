import type { IsoTimestamp } from '@mynah/engine';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { llmUsage } from '../../src/db/schema.js';
import { DrizzleBudgetTracker } from '../../src/engine-stores/budget/drizzle-budget-tracker.js';

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(llmUsage);
}

describe('DrizzleBudgetTracker', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('empty table: spentCents = 0, remaining = cap', async () => {
    const tracker = new DrizzleBudgetTracker(getDb(), { monthlyCapCents: 2000 });
    const status = await tracker.getStatus();
    expect(status.spentCents).toBe(0);
    expect(status.remainingCents).toBe(2000);
  });

  it('record then getStatus sums correctly (millicents → cents rounded up)', async () => {
    const tracker = new DrizzleBudgetTracker(getDb(), { monthlyCapCents: 2000 });
    await tracker.record({
      providerId: 'anthropic',
      model: 'claude',
      taskType: 'strategy',
      usage: { inputTokens: 100, outputTokens: 200 },
      costMillicents: 1500, // 1.5 cents
      latencyMs: 800,
      occurredAt: new Date().toISOString() as IsoTimestamp,
    });
    await tracker.record({
      providerId: 'google',
      model: 'gemini',
      taskType: 'content_writing',
      usage: { inputTokens: 50, outputTokens: 80 },
      costMillicents: 500, // 0.5 cents
      latencyMs: 400,
      occurredAt: new Date().toISOString() as IsoTimestamp,
    });
    const status = await tracker.getStatus();
    // 1500 + 500 = 2000 millicents = 2 cents
    expect(status.spentCents).toBe(2);
    expect(status.remainingCents).toBe(1998);
  });

  it('getRecords returns records since cutoff in ascending order', async () => {
    const tracker = new DrizzleBudgetTracker(getDb(), { monthlyCapCents: 2000 });
    const baseTime = Date.now();
    await tracker.record({
      providerId: 'p1',
      model: 'm',
      taskType: 'strategy',
      usage: { inputTokens: 1, outputTokens: 1 },
      costMillicents: 1,
      latencyMs: 1,
      occurredAt: new Date(baseTime + 1000).toISOString() as IsoTimestamp,
    });
    await tracker.record({
      providerId: 'p2',
      model: 'm',
      taskType: 'strategy',
      usage: { inputTokens: 1, outputTokens: 1 },
      costMillicents: 1,
      latencyMs: 1,
      occurredAt: new Date(baseTime + 2000).toISOString() as IsoTimestamp,
    });
    const cutoff = new Date(baseTime);
    const records = await tracker.getRecords(cutoff);
    expect(records).toHaveLength(2);
    expect(records[0]!.providerId).toBe('p1');
    expect(records[1]!.providerId).toBe('p2');
  });
});
