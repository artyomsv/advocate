import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { safetyEventTypeEnum } from './enums.js';

/**
 * Safety events — rate-limit hits, content rejections, platform warnings,
 * kill-switch activations. Audit trail for risk review.
 */
export const safetyEvents = pgTable(
  'safety_events',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    eventType: safetyEventTypeEnum('event_type').notNull(),
    details: jsonb('details'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    typeIdx: index('safety_events_type_idx').on(t.eventType),
    agentIdx: index('safety_events_agent_idx').on(t.agentId),
    createdIdx: index('safety_events_created_idx').on(t.createdAt),
  }),
);

export type SafetyEvent = typeof safetyEvents.$inferSelect;
export type NewSafetyEvent = typeof safetyEvents.$inferInsert;
