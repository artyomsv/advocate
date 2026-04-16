/**
 * @advocate/engine — Reusable multi-agent orchestration engine.
 *
 * This package contains the domain-agnostic core.
 * All social-media-specific logic lives in @advocate/app.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };

export const ENGINE_VERSION = packageJson.version;

// Core types
export type {
  AgentDefinition,
  AgentMetrics,
  AgentState,
  AgentStatus,
  LlmTaskType,
  MemoryConfig,
  ModelConfig,
} from './core/agent.js';
// Registry
export { AgentRegistry } from './core/registry.js';
export type {
  AnalysisInput,
  AnalysisReport,
  AnalystRole,
  ContentBrief,
  ContentCreatorRole,
  ContentDraft,
  ContentReview,
  Decision,
  DecisionContext,
  DecisionOption,
  DiscoveryCriteria,
  DiscoveryResult,
  EscalationRequest,
  HumanResponse,
  LeaderRole,
  MonitorEvent,
  MonitorTarget,
  QualityScore,
  Recommendation,
  ReviewerRole,
  ReviewResult,
  ScoutRole,
} from './core/role.js';
export type {
  AgentRuntime,
  AgentTaskInput,
  TaskResult,
  Trigger,
} from './core/runtime.js';
// Validation
export {
  agentDefinitionSchema,
  memoryConfigSchema,
  modelConfigSchema,
  parseAgentDefinition,
  safeParseAgentDefinition,
} from './core/validation.js';
// Heartbeat
export {
  type HeartbeatScheduler,
  InMemoryHeartbeatScheduler,
} from './heartbeat/scheduler.js';
export type {
  CronScheduleInput,
  EventHandler,
  EventHandlerInput,
  Schedule,
} from './heartbeat/types.js';
// LLM
export {
  type BudgetTracker,
  type BudgetTrackerOptions,
  InMemoryBudgetTracker,
} from './llm/budget.js';
export {
  type LLMProvider,
  StubLLMProvider,
  type StubLLMProviderOptions,
} from './llm/provider.js';
export {
  type GenerateOptions,
  InMemoryLLMRouter,
  type LLMRouter,
  type LLMRouterOptions,
  type ModelChoice,
  type ModelRoute,
  type RouterConfig,
  type RouterMode,
} from './llm/router.js';
export {
  BudgetExhaustedError,
  type BudgetStatus,
  type CostEstimate,
  type LlmRequest,
  type LlmResponse,
  type LlmTokenUsage,
  type LlmUsageRecord,
} from './llm/types.js';
// Memory
export {
  type ConsolidateOptions,
  type ConsolidationResult,
  type MemoryConsolidator,
  NaiveMemoryConsolidator,
} from './memory/consolidator.js';
export {
  type EpisodicMemoryStore,
  InMemoryEpisodicStore,
} from './memory/episodic-store.js';
export {
  InMemoryRelationalStore,
  type RelationalMemoryStore,
} from './memory/relational-store.js';
export type {
  ConsolidatedMemory,
  Episode,
  NewConsolidatedMemory,
  NewEpisode,
  NewRelationship,
  Relationship,
  Sentiment,
} from './memory/types.js';
// Messaging
export { InMemoryMessageBus, type MessageBus } from './messaging/bus.js';
export {
  type ConversationLog,
  InMemoryConversationLog,
} from './messaging/conversation-log.js';
export type {
  AgentMessage,
  MessageHandler,
  MessageType,
  NewAgentMessage,
  Subscription,
} from './messaging/types.js';
// Notifications
export {
  InMemoryNotificationSender,
  type NotificationSender,
} from './notifications/sender.js';
export type {
  Alert,
  ApprovalOption,
  ApprovalRequest,
  DailySummary,
  Milestone,
  Notification,
  NotificationKind,
  NotificationLevel,
  NotificationUrgency,
  SendResult,
  StrategyQuestion,
  WeeklyReport,
} from './notifications/types.js';
// Tasks
export { InMemoryKanbanBoard, type KanbanBoard } from './tasks/board.js';
export {
  canTransition,
  IllegalTransitionError,
  TRANSITIONS,
} from './tasks/transitions.js';
export type {
  NewArtifact,
  NewTask,
  Task,
  TaskArtifact,
  TaskComment,
  TaskFilter,
  TaskPriority,
  TaskStatus,
} from './tasks/types.js';
export type { Brand, DeepReadonly, IsoTimestamp } from './types/common.js';
export { isoNow } from './types/common.js';
// Shared types
export type { AgentId, MemoryId, MessageId, ProjectId, TaskId } from './types/ids.js';
export {
  asAgentId,
  asMemoryId,
  asMessageId,
  asProjectId,
  asTaskId,
  isUuidV4,
  UUID_V4_PATTERN,
} from './types/ids.js';
export type { AgentPermission } from './types/permissions.js';
export { isAgentPermission, KNOWN_PERMISSIONS } from './types/permissions.js';
