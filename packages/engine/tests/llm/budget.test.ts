import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryBudgetTracker } from '../../src/llm/budget.js';
import type { LlmUsageRecord } from '../../src/llm/types.js';
import type { IsoTimestamp } from '../../src/types/common.js';

function record(occurredAt: string, costMillicents: number): LlmUsageRecord {
  return {
    providerId: 'stub',
    model: 'stub-1',
    taskType: 'content_writing',
    usage: { inputTokens: 10, outputTokens: 10 },
    costMillicents,
    latencyMs: 10,
    occurredAt: occurredAt as IsoTimestamp,
  };
}

describe('InMemoryBudgetTracker', () => {
  let tracker: InMemoryBudgetTracker;

  beforeEach(() => {
    tracker = new InMemoryBudgetTracker({ monthlyCapCents: 2000 });
  });

  it('starts with zero spend and full budget', async () => {
    const status = await tracker.getStatus();
    expect(status.spentCents).toBe(0);
    expect(status.remainingCents).toBe(2000);
    expect(status.monthlyCapCents).toBe(2000);
  });

  it('record increments the current month spend (cents = millicents / 1000 rounded)', async () => {
    // 2500 millicents = 2.5 cents → rounds to 3 (ceil at aggregate boundary)
    await tracker.record(record('2026-04-10T12:00:00.000Z', 2500));
    const status = await tracker.getStatus(new Date('2026-04-15T12:00:00.000Z'));
    expect(status.spentCents).toBe(3);
  });

  it('aggregates multiple records within the same month', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 50_000)); // 50¢
    await tracker.record(record('2026-04-20T00:00:00.000Z', 30_000)); // 30¢
    const status = await tracker.getStatus(new Date('2026-04-25T00:00:00.000Z'));
    expect(status.spentCents).toBe(80);
  });

  it('does not count records from a different month', async () => {
    await tracker.record(record('2026-03-15T00:00:00.000Z', 100_000)); // March: 100¢
    await tracker.record(record('2026-04-10T00:00:00.000Z', 20_000)); // April: 20¢
    const status = await tracker.getStatus(new Date('2026-04-25T00:00:00.000Z'));
    expect(status.spentCents).toBe(20);
  });

  it('projectedMonthEndCents linearly extrapolates', async () => {
    // Spend 100¢ by day 10 in a 30-day month → projection ≈ 300¢
    await tracker.record(record('2026-04-05T00:00:00.000Z', 100_000));
    const status = await tracker.getStatus(new Date('2026-04-10T00:00:00.000Z'));
    expect(status.projectedMonthEndCents).toBeGreaterThan(250);
    expect(status.projectedMonthEndCents).toBeLessThan(350);
  });

  it('remainingCents clamps at 0 when over budget', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 5_000_000)); // 5000¢
    const status = await tracker.getStatus(new Date('2026-04-15T00:00:00.000Z'));
    expect(status.remainingCents).toBe(0);
    expect(status.spentCents).toBe(5000);
  });

  it('getRecords returns records in chronological order', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 10_000));
    await tracker.record(record('2026-04-05T00:00:00.000Z', 20_000));
    const list = await tracker.getRecords(new Date('2026-04-01T00:00:00.000Z'));
    expect(list.map((r) => r.occurredAt)).toEqual([
      '2026-04-05T00:00:00.000Z',
      '2026-04-10T00:00:00.000Z',
    ]);
  });
});
