import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { products } from './products.js';

/**
 * LLM-generated insight rows written by the Analytics Analyst. Read by the
 * Strategist on next draft to shape plan selection.
 */
export const insights = pgTable(
  'insights',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
    metricsWindow: jsonb('metrics_window'),
  },
  (t) => ({
    productGeneratedIdx: index('insights_product_generated_idx').on(t.productId, t.generatedAt),
  }),
);

export type Insight = typeof insights.$inferSelect;
export type NewInsight = typeof insights.$inferInsert;
