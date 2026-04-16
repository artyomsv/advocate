import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, ProjectId, TaskId } from '../types/ids.js';

export type TaskStatus = 'backlog' | 'in_progress' | 'in_review' | 'approved' | 'done' | 'blocked';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: TaskId;
  projectId: ProjectId;
  title: string;
  description: string;
  /** Application-defined task type (e.g. 'content_draft', 'research'). */
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: AgentId;
  createdBy: AgentId;
  dependsOn: readonly TaskId[];
  createdAt: IsoTimestamp;
  startedAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
}

export interface NewTask {
  projectId: ProjectId;
  title: string;
  description: string;
  type: string;
  priority?: TaskPriority;
  assignedTo?: AgentId;
  createdBy: AgentId;
  dependsOn?: readonly TaskId[];
}

export interface TaskFilter {
  projectId?: ProjectId;
  assignedTo?: AgentId;
  status?: TaskStatus;
  type?: string;
}

export interface TaskComment {
  id: string;
  taskId: TaskId;
  agentId: AgentId;
  agentRole: string;
  content: string;
  createdAt: IsoTimestamp;
}

export interface TaskArtifact {
  id: string;
  taskId: TaskId;
  /** Application-defined artifact type (e.g. 'content_draft', 'analysis_report'). */
  type: string;
  content: string;
  createdBy: AgentId;
  createdAt: IsoTimestamp;
}

export interface NewArtifact {
  type: string;
  content: string;
  createdBy: AgentId;
}
