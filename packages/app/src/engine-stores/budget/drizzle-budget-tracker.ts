import type { BudgetStatus, BudgetTracker, IsoTimestamp, LlmUsageRecord } from '@mynah/engine';
import { asc, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import { llmUsage } from '../../db/schema.js';

function rowToRecord(r: typeof llmUsage.$inferSelect): LlmUsageRecord {
  return {
    providerId: r.provider,
    model: r.model,
    taskType: r.taskType,
    usage: {
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
      cachedTokens: r.cachedTokens,
    },
    costMillicents: r.costMillicents,
    latencyMs: r.latencyMs,
    occurredAt: r.createdAt.toISOString() as IsoTimestamp,
    qualityScore: r.qualityScore ?? undefined,
  };
}

export interface DrizzleBudgetTrackerOptions {
  monthlyCapCents: number;
}

/**
 * Persists every LLM call to llm_usage (so agent-stats endpoint has real
 * data). Aggregates spend from the same table on demand — no running
 * counter. Aggregation cost is a single COUNT/SUM per call, < 1ms for
 * the volume Mynah is going to see.
 */
export class DrizzleBudgetTracker implements BudgetTracker {
  readonly #monthlyCapCents: number;

  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    options: DrizzleBudgetTrackerOptions,
  ) {
    this.#monthlyCapCents = options.monthlyCapCents;
  }

  async record(usage: LlmUsageRecord): Promise<void> {
    await this.db.insert(llmUsage).values({
      taskType: usage.taskType,
      provider: usage.providerId,
      model: usage.model,
      inputTokens: usage.usage.inputTokens,
      outputTokens: usage.usage.outputTokens,
      cachedTokens: usage.usage.cachedTokens ?? 0,
      costMillicents: usage.costMillicents,
      latencyMs: usage.latencyMs,
      qualityScore: usage.qualityScore,
      createdAt: new Date(usage.occurredAt),
    });
  }

  async getStatus(now: Date = new Date()): Promise<BudgetStatus> {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [row] = await this.db
      .select({
        total: sql<string>`COALESCE(SUM(${llmUsage.costMillicents}), 0)`,
      })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, monthStart));
    const millicents = Number(row?.total ?? 0);
    const spentCents = Math.ceil(millicents / 1000);
    const remainingCents = Math.max(0, this.#monthlyCapCents - spentCents);

    const daysElapsed = Math.max(1, now.getUTCDate());
    const daysInMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
    ).getUTCDate();
    const projectedMonthEndCents = Math.ceil((spentCents / daysElapsed) * daysInMonth);

    return {
      monthlyCapCents: this.#monthlyCapCents,
      spentCents,
      remainingCents,
      projectedMonthEndCents,
    };
  }

  async getRecords(since: Date): Promise<readonly LlmUsageRecord[]> {
    const rows = await this.db
      .select()
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, since))
      .orderBy(asc(llmUsage.createdAt));
    return rows.map(rowToRecord);
  }
}
