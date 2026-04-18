import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { products } from '../app/products.js';
import { agents } from './agents.js';
import { sentimentEnum } from './enums.js';

/**
 * Episodic memory — raw events from the last ~7 days. Older events
 * consolidate into `consolidatedMemories`.
 */
export const episodicMemories = pgTable(
  'episodic_memories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    outcome: text('outcome').notNull(),
    lesson: text('lesson'),
    sentiment: sentimentEnum('sentiment').notNull().default('neutral'),
    context: jsonb('context'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('episodic_memories_agent_idx').on(t.agentId),
    productIdx: index('episodic_memories_product_idx').on(t.productId),
    agentProductCreatedIdx: index('episodic_memories_agent_product_created_idx').on(
      t.agentId,
      t.productId,
      t.createdAt,
    ),
  }),
);

/**
 * Consolidated memory — LLM-compressed summaries of older episodes.
 */
export const consolidatedMemories = pgTable(
  'consolidated_memories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    sourceEpisodeIds: jsonb('source_episode_ids').notNull().$type<string[]>(),
    summary: text('summary').notNull(),
    lessons: jsonb('lessons').notNull().$type<string[]>(),
    periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
    periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
    consolidatedAt: timestamp('consolidated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('consolidated_memories_agent_idx').on(t.agentId),
  }),
);

/**
 * Relational memory — who the agent has interacted with externally.
 */
export const relationalMemories = pgTable(
  'relational_memories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    externalUsername: varchar('external_username', { length: 200 }).notNull(),
    platform: varchar('platform', { length: 50 }).notNull(),
    context: text('context').notNull(),
    sentiment: sentimentEnum('sentiment').notNull().default('neutral'),
    interactionCount: integer('interaction_count').notNull().default(1),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    tags: jsonb('tags').$type<string[]>(),
  },
  (t) => ({
    agentIdx: index('relational_memories_agent_idx').on(t.agentId),
    productIdx: index('relational_memories_product_idx').on(t.productId),
    lookupIdx: index('relational_memories_lookup_idx').on(
      t.agentId,
      t.productId,
      t.platform,
      t.externalUsername,
    ),
  }),
);

export type EpisodicMemory = typeof episodicMemories.$inferSelect;
export type NewEpisodicMemory = typeof episodicMemories.$inferInsert;
export type ConsolidatedMemory = typeof consolidatedMemories.$inferSelect;
export type RelationalMemory = typeof relationalMemories.$inferSelect;
export type NewRelationalMemory = typeof relationalMemories.$inferInsert;
