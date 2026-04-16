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
