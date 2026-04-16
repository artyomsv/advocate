import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, TaskId } from '../types/ids.js';
import { canTransition, IllegalTransitionError } from './transitions.js';
import type {
  NewArtifact,
  NewTask,
  Task,
  TaskArtifact,
  TaskComment,
  TaskFilter,
  TaskStatus,
} from './types.js';

/**
 * Task board contract. The board is the authoritative owner of task state —
 * it validates transitions, stamps lifecycle timestamps, and records comments
 * and artifacts against tasks.
 */
export interface KanbanBoard {
  createTask(input: NewTask): Promise<Task>;
  getTask(id: TaskId): Promise<Task | undefined>;
  listTasks(filter?: TaskFilter): Promise<readonly Task[]>;
  updateStatus(id: TaskId, status: TaskStatus, actor: AgentId): Promise<Task>;
  assign(id: TaskId, toAgentId: AgentId): Promise<Task>;
  addComment(
    taskId: TaskId,
    agentId: AgentId,
    content: string,
    agentRole: string,
  ): Promise<TaskComment>;
  addArtifact(taskId: TaskId, artifact: NewArtifact): Promise<TaskArtifact>;
  getComments(taskId: TaskId): Promise<readonly TaskComment[]>;
  getArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]>;
}

export class InMemoryKanbanBoard implements KanbanBoard {
  readonly #tasks = new Map<TaskId, Task>();
  readonly #comments = new Map<TaskId, TaskComment[]>();
  readonly #artifacts = new Map<TaskId, TaskArtifact[]>();

  async createTask(input: NewTask): Promise<Task> {
    const now = isoNow();
    const task: Task = {
      id: randomUUID() as TaskId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority ?? 'medium',
      status: 'backlog',
      assignedTo: input.assignedTo,
      createdBy: input.createdBy,
      dependsOn: input.dependsOn ?? [],
      createdAt: now,
    };
    this.#tasks.set(task.id, task);
    return task;
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    return this.#tasks.get(id);
  }

  async listTasks(filter: TaskFilter = {}): Promise<readonly Task[]> {
    const out: Task[] = [];
    for (const task of this.#tasks.values()) {
      if (filter.projectId && task.projectId !== filter.projectId) continue;
      if (filter.assignedTo && task.assignedTo !== filter.assignedTo) continue;
      if (filter.status && task.status !== filter.status) continue;
      if (filter.type && task.type !== filter.type) continue;
      out.push(task);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async updateStatus(id: TaskId, status: TaskStatus, _actor: AgentId): Promise<Task> {
    const task = this.#mustGet(id);
    if (!canTransition(task.status, status)) {
      throw new IllegalTransitionError(task.status, status);
    }

    const now = isoNow();
    const startedAt = task.startedAt ?? (status === 'in_progress' ? now : undefined);
    const completedAt = task.completedAt ?? (status === 'done' ? now : undefined);

    const updated: Task = { ...task, status, startedAt, completedAt };
    this.#tasks.set(id, updated);
    return updated;
  }

  async assign(id: TaskId, toAgentId: AgentId): Promise<Task> {
    const task = this.#mustGet(id);
    const updated: Task = { ...task, assignedTo: toAgentId };
    this.#tasks.set(id, updated);
    return updated;
  }

  async addComment(
    taskId: TaskId,
    agentId: AgentId,
    content: string,
    agentRole: string,
  ): Promise<TaskComment> {
    this.#mustGet(taskId); // assert task exists
    const comment: TaskComment = {
      id: randomUUID(),
      taskId,
      agentId,
      agentRole,
      content,
      createdAt: isoNow(),
    };
    const list = this.#comments.get(taskId) ?? [];
    list.push(comment);
    this.#comments.set(taskId, list);
    return comment;
  }

  async addArtifact(taskId: TaskId, input: NewArtifact): Promise<TaskArtifact> {
    this.#mustGet(taskId);
    const artifact: TaskArtifact = {
      id: randomUUID(),
      taskId,
      type: input.type,
      content: input.content,
      createdBy: input.createdBy,
      createdAt: isoNow(),
    };
    const list = this.#artifacts.get(taskId) ?? [];
    list.push(artifact);
    this.#artifacts.set(taskId, list);
    return artifact;
  }

  async getComments(taskId: TaskId): Promise<readonly TaskComment[]> {
    return [...(this.#comments.get(taskId) ?? [])];
  }

  async getArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    return [...(this.#artifacts.get(taskId) ?? [])];
  }

  #mustGet(id: TaskId): Task {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  }
}
