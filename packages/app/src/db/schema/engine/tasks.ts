import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { agents } from './agents.js';
import { taskPriorityEnum, taskStatusEnum } from './enums.js';

/**
 * Kanban tasks created by agents (typically Campaign Lead). Assigned to
 * other agents for execution. Tracks lifecycle from backlog through done.
 *
 * `dependsOn` is a jsonb array of task IDs — foreign keys would require a
 * junction table; jsonb is lighter for the typical 0-2 deps case.
 */
export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    projectId: uuid('project_id').notNull(),
    title: varchar('title', { length: 500 }).notNull(),
    description: text('description').notNull(),
    type: varchar('type', { length: 100 }).notNull(),
    priority: taskPriorityEnum('priority').notNull().default('medium'),
    status: taskStatusEnum('status').notNull().default('backlog'),
    assignedTo: uuid('assigned_to').references(() => agents.id),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => agents.id),
    dependsOn: jsonb('depends_on').$type<string[]>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('agent_tasks_status_idx').on(t.status),
    assignedIdx: index('agent_tasks_assigned_idx').on(t.assignedTo),
    projectIdx: index('agent_tasks_project_idx').on(t.projectId),
  }),
);

/**
 * Agent comments on tasks — the reasoning trail for kanban decisions.
 */
export const taskComments = pgTable(
  'task_comments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => agentTasks.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id),
    agentRole: varchar('agent_role', { length: 100 }).notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('task_comments_task_idx').on(t.taskId),
  }),
);

/**
 * Task outputs — content drafts, analysis reports, research summaries.
 */
export const taskArtifacts = pgTable(
  'task_artifacts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    taskId: uuid('task_id')
      .notNull()
      .references(() => agentTasks.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 100 }).notNull(),
    content: text('content').notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => agents.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    taskIdx: index('task_artifacts_task_idx').on(t.taskId),
    typeIdx: index('task_artifacts_type_idx').on(t.type),
  }),
);

export type AgentTask = typeof agentTasks.$inferSelect;
export type NewAgentTask = typeof agentTasks.$inferInsert;
export type TaskComment = typeof taskComments.$inferSelect;
export type TaskArtifact = typeof taskArtifacts.$inferSelect;
