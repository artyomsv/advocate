import { desc, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { getEnv } from '../../config/env.js';
import { getDb } from '../../db/connection.js';
import { llmUsage } from '../../db/schema.js';
import { createDefaultRouter } from '../../llm/default-router.js';

export interface LlmStatus {
  mode: string;
  monthlyBudgetCents: number;
  activeProviders: readonly string[];
  routes: readonly string[];
}

export interface LlmSpendBucket {
  key: string;
  costMillicents: number;
  calls: number;
}

export interface LlmSpendSummary {
  windowStart: string;
  byProvider: LlmSpendBucket[];
  byTaskType: LlmSpendBucket[];
  byModel: LlmSpendBucket[];
  totalMillicents: number;
  totalCalls: number;
}

function monthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function registerLlmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/llm/status', { preHandler: [app.authenticate] }, async (): Promise<LlmStatus> => {
    const env = getEnv();
    const { activeProviders, routeKeys } = createDefaultRouter({ env });
    return {
      mode: env.LLM_DEFAULT_MODE,
      monthlyBudgetCents: env.LLM_MONTHLY_BUDGET_CENTS,
      activeProviders,
      routes: routeKeys,
    };
  });

  app.get(
    '/llm/spend',
    { preHandler: [app.authenticate] },
    async (): Promise<LlmSpendSummary> => {
      const db = getDb();
      const since = monthStart();

      const [byProvider, byTaskType, byModel] = await Promise.all([
        db
          .select({
            key: llmUsage.provider,
            costMillicents: sql<number>`SUM(${llmUsage.costMillicents})::int`,
            calls: sql<number>`COUNT(*)::int`,
          })
          .from(llmUsage)
          .where(gte(llmUsage.createdAt, since))
          .groupBy(llmUsage.provider)
          .orderBy(desc(sql`SUM(${llmUsage.costMillicents})`)),
        db
          .select({
            key: llmUsage.taskType,
            costMillicents: sql<number>`SUM(${llmUsage.costMillicents})::int`,
            calls: sql<number>`COUNT(*)::int`,
          })
          .from(llmUsage)
          .where(gte(llmUsage.createdAt, since))
          .groupBy(llmUsage.taskType)
          .orderBy(desc(sql`SUM(${llmUsage.costMillicents})`)),
        db
          .select({
            key: llmUsage.model,
            costMillicents: sql<number>`SUM(${llmUsage.costMillicents})::int`,
            calls: sql<number>`COUNT(*)::int`,
          })
          .from(llmUsage)
          .where(gte(llmUsage.createdAt, since))
          .groupBy(llmUsage.model)
          .orderBy(desc(sql`SUM(${llmUsage.costMillicents})`)),
      ]);

      const total = byProvider.reduce(
        (acc, r) => {
          acc.millicents += r.costMillicents;
          acc.calls += r.calls;
          return acc;
        },
        { millicents: 0, calls: 0 },
      );

      return {
        windowStart: since.toISOString(),
        byProvider,
        byTaskType,
        byModel,
        totalMillicents: total.millicents,
        totalCalls: total.calls,
      };
    },
  );
}
