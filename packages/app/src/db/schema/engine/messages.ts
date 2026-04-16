import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { messageTypeEnum } from './enums.js';
import { agentTasks } from './tasks.js';

/**
 * Inter-agent communication log. Every agent-to-agent message is recorded
 * here so the dashboard can render threaded decision trails.
 */
export const agentMessages = pgTable(
  'agent_messages',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    fromAgent: uuid('from_agent')
      .notNull()
      .references(() => agents.id),
    toAgent: uuid('to_agent')
      .notNull()
      .references(() => agents.id),
    type: messageTypeEnum('type').notNull(),
    subject: varchar('subject', { length: 500 }).notNull(),
    content: text('content').notNull(),
    replyTo: uuid('reply_to'),
    taskId: uuid('task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index('agent_messages_from_idx').on(t.fromAgent),
    toIdx: index('agent_messages_to_idx').on(t.toAgent),
    taskIdx: index('agent_messages_task_idx').on(t.taskId),
    createdIdx: index('agent_messages_created_idx').on(t.createdAt),
  }),
);

export type AgentMessage = typeof agentMessages.$inferSelect;
export type NewAgentMessage = typeof agentMessages.$inferInsert;
