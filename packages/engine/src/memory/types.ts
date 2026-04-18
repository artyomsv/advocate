import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';

export type Sentiment = 'positive' | 'neutral' | 'negative';

/**
 * A single raw event in an agent's history. Emitted by the runtime on every
 * task completion, platform interaction, or significant decision.
 *
 * Older episodes are consolidated into `ConsolidatedMemory` rows by the
 * `MemoryConsolidator` on the schedule defined by the agent's `MemoryConfig`.
 */
export interface Episode {
  id: MemoryId;
  agentId: AgentId;
  /** Product this episode is scoped to — raw episodes are per-product. */
  productId: string;
  action: string;
  outcome: string;
  /** Optional AI-extracted lesson (e.g. "r/X prefers specific dollar amounts"). */
  lesson?: string;
  sentiment: Sentiment;
  /** Free-form context: platform, community, thread URL, etc. */
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

export interface NewEpisode {
  agentId: AgentId;
  productId: string;
  action: string;
  outcome: string;
  lesson?: string;
  sentiment?: Sentiment;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Compressed summary of a window of older episodes. The consolidator produces
 * these and typically deletes the source episodes to cap storage growth.
 */
export interface ConsolidatedMemory {
  id: MemoryId;
  agentId: AgentId;
  sourceEpisodeIds: readonly MemoryId[];
  summary: string;
  lessons: readonly string[];
  periodFrom: IsoTimestamp;
  periodTo: IsoTimestamp;
  consolidatedAt: IsoTimestamp;
}

/**
 * Input to `saveConsolidation` — id + consolidatedAt are assigned by the store.
 */
export interface NewConsolidatedMemory {
  agentId: AgentId;
  sourceEpisodeIds: readonly MemoryId[];
  summary: string;
  lessons: readonly string[];
  periodFrom: IsoTimestamp;
  periodTo: IsoTimestamp;
}

/**
 * A tracked relationship between an agent and an external actor (a platform
 * user, moderator, or other community member).
 */
export interface Relationship {
  id: MemoryId;
  agentId: AgentId;
  productId: string;
  externalUsername: string;
  platform: string;
  context: string;
  sentiment: Sentiment;
  interactionCount: number;
  lastInteractionAt: IsoTimestamp;
  notes?: string;
  tags: readonly string[];
}

export interface NewRelationship {
  agentId: AgentId;
  productId: string;
  externalUsername: string;
  platform: string;
  context: string;
  sentiment?: Sentiment;
  notes?: string;
  tags?: readonly string[];
}
