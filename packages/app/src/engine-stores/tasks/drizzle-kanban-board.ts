import type {
  AgentId,
  IsoTimestamp,
  KanbanBoard,
  NewArtifact,
  NewTask,
  ProjectId,
  Task,
  TaskArtifact,
  TaskComment,
  TaskFilter,
  TaskId,
  TaskStatus,
} from '@mynah/engine';
import { IllegalTransitionError, canTransition } from '@mynah/engine';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import { agentTasks, taskArtifacts, taskComments } from '../../db/schema.js';

function rowToTask(r: typeof agentTasks.$inferSelect): Task {
  return {
    id: r.id as TaskId,
    projectId: r.projectId as ProjectId,
    title: r.title,
    description: r.description,
    type: r.type,
    priority: r.priority as Task['priority'],
    status: r.status as TaskStatus,
    assignedTo: (r.assignedTo ?? undefined) as AgentId | undefined,
    createdBy: r.createdBy as AgentId,
    dependsOn: ((r.dependsOn ?? []) as string[]) as TaskId[],
    createdAt: r.createdAt.toISOString() as IsoTimestamp,
    startedAt: r.startedAt ? (r.startedAt.toISOString() as IsoTimestamp) : undefined,
    completedAt: r.completedAt ? (r.completedAt.toISOString() as IsoTimestamp) : undefined,
  };
}

function rowToComment(r: typeof taskComments.$inferSelect): TaskComment {
  return {
    id: r.id,
    taskId: r.taskId as TaskId,
    agentId: r.agentId as AgentId,
    agentRole: r.agentRole,
    content: r.content,
    createdAt: r.createdAt.toISOString() as IsoTimestamp,
  };
}

function rowToArtifact(r: typeof taskArtifacts.$inferSelect): TaskArtifact {
  return {
    id: r.id,
    taskId: r.taskId as TaskId,
    type: r.type,
    content: r.content,
    createdBy: r.createdBy as AgentId,
    createdAt: r.createdAt.toISOString() as IsoTimestamp,
  };
}

export class DrizzleKanbanBoard implements KanbanBoard {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async createTask(input: NewTask): Promise<Task> {
    const [row] = await this.db
      .insert(agentTasks)
      .values({
        projectId: input.projectId,
        title: input.title,
        description: input.description,
        type: input.type,
        priority: input.priority ?? 'medium',
        assignedTo: input.assignedTo,
        createdBy: input.createdBy,
        dependsOn: input.dependsOn ? [...input.dependsOn] : [],
      })
      .returning();
    if (!row) throw new Error('task insert returned no row');
    return rowToTask(row);
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    const [row] = await this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.id, id))
      .limit(1);
    return row ? rowToTask(row) : undefined;
  }

  async listTasks(filter: TaskFilter = {}): Promise<readonly Task[]> {
    const conds = [];
    if (filter.projectId) conds.push(eq(agentTasks.projectId, filter.projectId));
    if (filter.assignedTo) conds.push(eq(agentTasks.assignedTo, filter.assignedTo));
    if (filter.status) conds.push(eq(agentTasks.status, filter.status));
    if (filter.type) conds.push(eq(agentTasks.type, filter.type));
    const q = this.db.select().from(agentTasks);
    const rows = await (conds.length > 0 ? q.where(and(...conds)) : q).orderBy(
      desc(agentTasks.createdAt),
    );
    return rows.map(rowToTask);
  }

  async updateStatus(id: TaskId, status: TaskStatus, _actor: AgentId): Promise<Task> {
    const current = await this.getTask(id);
    if (!current) throw new Error(`Task ${id} not found`);
    if (!canTransition(current.status, status)) {
      throw new IllegalTransitionError(current.status, status);
    }
    const now = new Date();
    const [row] = await this.db
      .update(agentTasks)
      .set({
        status,
        startedAt: current.startedAt
          ? new Date(current.startedAt)
          : status === 'in_progress'
            ? now
            : null,
        completedAt: current.completedAt
          ? new Date(current.completedAt)
          : status === 'done'
            ? now
            : null,
      })
      .where(eq(agentTasks.id, id))
      .returning();
    if (!row) throw new Error(`Task ${id} update returned no row`);
    return rowToTask(row);
  }

  async assign(id: TaskId, toAgentId: AgentId): Promise<Task> {
    const [row] = await this.db
      .update(agentTasks)
      .set({ assignedTo: toAgentId })
      .where(eq(agentTasks.id, id))
      .returning();
    if (!row) throw new Error(`Task ${id} not found`);
    return rowToTask(row);
  }

  async addComment(
    taskId: TaskId,
    agentId: AgentId,
    content: string,
    agentRole: string,
  ): Promise<TaskComment> {
    const [row] = await this.db
      .insert(taskComments)
      .values({ taskId, agentId, agentRole, content })
      .returning();
    if (!row) throw new Error('comment insert returned no row');
    return rowToComment(row);
  }

  async addArtifact(taskId: TaskId, input: NewArtifact): Promise<TaskArtifact> {
    const [row] = await this.db
      .insert(taskArtifacts)
      .values({
        taskId,
        type: input.type,
        content: input.content,
        createdBy: input.createdBy,
      })
      .returning();
    if (!row) throw new Error('artifact insert returned no row');
    return rowToArtifact(row);
  }

  async getComments(taskId: TaskId): Promise<readonly TaskComment[]> {
    const rows = await this.db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(taskComments.createdAt);
    return rows.map(rowToComment);
  }

  async getArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    const rows = await this.db
      .select()
      .from(taskArtifacts)
      .where(eq(taskArtifacts.taskId, taskId))
      .orderBy(taskArtifacts.createdAt);
    return rows.map(rowToArtifact);
  }
}
