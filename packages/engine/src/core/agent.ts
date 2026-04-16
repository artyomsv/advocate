import type { IsoTimestamp } from '../types/common.js';
import type { AgentId } from '../types/ids.js';
import type { AgentPermission } from '../types/permissions.js';

/**
 * Which LLM task-type routing bucket this agent's calls fall under.
 * The router (Plan 06) maps task types to model choices.
 */
export type LlmTaskType = 'content_writing' | 'strategy' | 'classification' | 'bulk';

/**
 * Configures how the router picks a model for this agent's LLM calls.
 */
export interface ModelConfig {
  /** The routing bucket. */
  taskType: LlmTaskType;
  /** Optional per-agent temperature override (0.0–1.0). */
  temperatureOverride?: number;
  /** Optional per-agent max-tokens override. */
  maxTokensOverride?: number;
  /** Whether calls from this agent can route to budget-tier (e.g. Chinese) models. */
  allowBudgetTier?: boolean;
}

/**
 * Controls the agent's episodic + relational memory behavior.
 */
export interface MemoryConfig {
  /** Record episodes to episodic memory. */
  episodicEnabled: boolean;
  /** Maintain relational memory (who the agent has interacted with). */
  relationalEnabled: boolean;
  /** How often the memory consolidator compresses raw episodes. 0 = never. */
  consolidationIntervalHours: number;
  /** How many raw episodes to retain before consolidation truncates them. */
  maxRecentEpisodes: number;
}

/**
 * The registered, versioned identity of an agent.
 */
export interface AgentDefinition {
  id: AgentId;
  name: string;
  role: string;
  /** System prompt — the "identity" layer in the three-layer prompt stack. */
  soul: string;
  modelConfig: ModelConfig;
  memoryConfig: MemoryConfig;
  permissions: readonly AgentPermission[];
  /** Who this agent reports to (enables hierarchy + escalation). */
  parentId?: AgentId;
  /** Free-form application metadata — not interpreted by the engine. */
  metadata?: Record<string, unknown>;
}

/**
 * Runtime lifecycle state.
 */
export type AgentState = 'idle' | 'working' | 'waiting_approval' | 'sleeping' | 'stopped';

/**
 * Current live status of an agent.
 */
export interface AgentStatus {
  agentId: AgentId;
  state: AgentState;
  currentTaskId?: string;
  lastActiveAt?: IsoTimestamp;
  metrics: AgentMetrics;
}

export interface AgentMetrics {
  tasksCompleted: number;
  tasksInProgress: number;
  messagesExchanged: number;
}
