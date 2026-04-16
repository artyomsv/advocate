import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agentStateEnum } from './enums.js';

/**
 * Registered agents. Each represents a role in the hierarchy
 * (Campaign Lead, Strategist, Scout, Content Writer, etc.) or a persona
 * agent bound to a Legend.
 *
 * `soul` is the full system prompt text — the "identity" layer in the
 * three-layer prompt architecture. Large (multi-kB); stored inline.
 */
export const agents = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 200 }).notNull(),
    role: varchar('role', { length: 100 }).notNull(),
    soul: text('soul').notNull(),
    modelConfig: jsonb('model_config').notNull(),
    memoryConfig: jsonb('memory_config').notNull(),
    permissions: jsonb('permissions').notNull().$type<string[]>(),
    parentId: uuid('parent_id'),
    state: agentStateEnum('state').notNull().default('idle'),
    metadata: jsonb('metadata'),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    roleIdx: index('agents_role_idx').on(t.role),
    parentIdx: index('agents_parent_idx').on(t.parentId),
    stateIdx: index('agents_state_idx').on(t.state),
  }),
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
