import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/**
 * Per-call LLM usage tracking. Cost stored in millicents (1/100,000 dollar)
 * for per-token precision; aggregates to cents at the billing boundary.
 */
export const llmUsage = pgTable(
  'llm_usage',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    taskType: varchar('task_type', { length: 100 }).notNull(),
    provider: varchar('provider', { length: 50 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    costMillicents: integer('cost_millicents').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    qualityScore: integer('quality_score'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    providerIdx: index('llm_usage_provider_idx').on(t.provider),
    taskTypeIdx: index('llm_usage_task_type_idx').on(t.taskType),
    createdIdx: index('llm_usage_created_idx').on(t.createdAt),
    agentCreatedIdx: index('llm_usage_agent_created_idx').on(t.agentId, t.createdAt),
  }),
);

export type LlmUsage = typeof llmUsage.$inferSelect;
export type NewLlmUsage = typeof llmUsage.$inferInsert;
