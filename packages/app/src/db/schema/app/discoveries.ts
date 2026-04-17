import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { communities } from './communities.js';
import { products } from './products.js';

/**
 * Every thread Scout scored, regardless of whether it was dispatched.
 * Gives the owner visibility for threshold tuning + per-community accuracy
 * analysis: "we scored 200 threads in r/cooking last week, dispatched 12,
 * but 6 of those got rejected — maybe raise threshold to 8".
 */
export const discoveries = pgTable(
  'discoveries',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    platformThreadId: varchar('platform_thread_id', { length: 200 }).notNull(),
    url: text('url'),
    title: text('title').notNull(),
    author: varchar('author', { length: 200 }),
    snippet: text('snippet'),
    score: numeric('score', { precision: 3, scale: 1 }).notNull(),
    dispatched: boolean('dispatched').notNull().default(false),
    dispatchReason: text('dispatch_reason'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productScannedIdx: index('discoveries_product_scanned_idx').on(t.productId, t.scannedAt),
    communityScannedIdx: index('discoveries_community_scanned_idx').on(t.communityId, t.scannedAt),
    scoreIdx: index('discoveries_score_idx').on(t.score),
  }),
);

export type Discovery = typeof discoveries.$inferSelect;
export type NewDiscovery = typeof discoveries.$inferInsert;
