import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';

/**
 * Registered cron schedules for agent wake-ups. BullMQ's upsertJobScheduler
 * writes authoritative schedule state to Redis; this table is the human-
 * readable reflection for the dashboard.
 */
export const heartbeatSchedules = pgTable(
  'heartbeat_schedules',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    cronPattern: varchar('cron_pattern', { length: 100 }).notNull(),
    jobType: varchar('job_type', { length: 100 }).notNull(),
    jobData: jsonb('job_data'),
    enabled: boolean('enabled').notNull().default(true),
    lastRunAt: timestamp('last_run_at', { withTimezone: true }),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('heartbeat_schedules_agent_idx').on(t.agentId),
    enabledIdx: index('heartbeat_schedules_enabled_idx').on(t.enabled),
  }),
);

export type HeartbeatSchedule = typeof heartbeatSchedules.$inferSelect;
export type NewHeartbeatSchedule = typeof heartbeatSchedules.$inferInsert;
