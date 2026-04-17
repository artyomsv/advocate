import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { productStatusEnum } from './enums.js';

/**
 * Products Mynah is promoting. Each product has its own legends and campaigns.
 * Knowledge fields are jsonb for schema flexibility — the Product Intelligence
 * agent builds them from source docs and they can evolve without migrations.
 *
 * Fairy Book Store is the first product to populate (Plan 08+).
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull().unique(),
    description: text('description').notNull(),
    url: varchar('url', { length: 500 }),
    status: productStatusEnum('status').notNull().default('draft'),
    valueProps: jsonb('value_props').notNull().$type<string[]>(),
    painPoints: jsonb('pain_points').notNull().$type<string[]>(),
    talkingPoints: jsonb('talking_points').notNull().$type<string[]>(),
    competitorComparisons:
      jsonb('competitor_comparisons').$type<{ name: string; comparison: string }[]>(),
    neverSay: jsonb('never_say').$type<string[]>(),
    targetAudiences: jsonb('target_audiences').$type<{ segment: string; platforms: string[] }[]>(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugIdx: index('products_slug_idx').on(t.slug),
    statusIdx: index('products_status_idx').on(t.status),
  }),
);

export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
