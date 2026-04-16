import type { AgentId } from '../types/ids.js';
import type { AgentDefinition, AgentStatus } from './agent.js';

/**
 * A wake trigger — either scheduled (cron) or event-driven. The Runtime
 * resolves a trigger into an agent method call.
 */
export interface Trigger {
  type: 'cron' | 'event';
  name: string;
  payload?: Record<string, unknown>;
}

/**
 * A concrete task the Runtime hands to an agent for execution. This is
 * a different concept from the Kanban `AgentTask` (DB row) — that's a
 * workflow artifact; this is the runtime dispatch unit.
 */
export interface AgentTaskInput {
  taskId: string;
  taskType: string;
  payload: Record<string, unknown>;
}

export interface TaskResult {
  ok: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

/**
 * Agent lifecycle runtime. Implementations wire concrete behavior (BullMQ,
 * in-memory, etc.). Plan 05 provides the default BullMQ-backed implementation.
 */
export interface AgentRuntime {
  /** Register an agent definition. Must be called before start(). */
  register(definition: AgentDefinition): Promise<void>;

  /** Move an agent from `stopped` to `idle` so it can accept triggers. */
  start(agentId: AgentId): Promise<void>;

  /** Stop an agent. In-flight tasks complete; new triggers are rejected. */
  stop(agentId: AgentId): Promise<void>;

  /** Wake an agent with a trigger. The runtime dispatches to the right method. */
  wake(agentId: AgentId, trigger: Trigger): Promise<void>;

  /** Get the current status of an agent. */
  getStatus(agentId: AgentId): Promise<AgentStatus>;

  /** List all registered agents' statuses. */
  listAgents(): Promise<readonly AgentStatus[]>;

  /** Execute a single task synchronously (used by tests + internal runtime). */
  execute(agentId: AgentId, task: AgentTaskInput): Promise<TaskResult>;
}
