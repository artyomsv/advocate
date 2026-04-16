import type { IsoTimestamp } from '../types/common.js';
import type { AgentId } from '../types/ids.js';
import type { EpisodicMemoryStore } from './episodic-store.js';
import type { ConsolidatedMemory } from './types.js';

export interface ConsolidateOptions {
  /** Consolidate episodes older than this timestamp. */
  olderThan: IsoTimestamp;
  /** Minimum candidate episodes to bother consolidating; below this it's a no-op. Default 1, minimum 1. */
  minEpisodes?: number;
}

export interface ConsolidationResult {
  /** The new summary row, or undefined if the call was a no-op. */
  consolidation?: ConsolidatedMemory;
  /** Count of raw episodes deleted in favor of the summary. */
  episodesRemoved: number;
}

/**
 * Strategy for compressing old episodes into summaries. The default
 * `NaiveMemoryConsolidator` implementation concatenates actions/outcomes
 * without LLM help — sufficient for tests and for a non-LLM fallback.
 * Plan 06 will add `LlmMemoryConsolidator` backed by the router.
 */
export interface MemoryConsolidator {
  consolidate(agentId: AgentId, options: ConsolidateOptions): Promise<ConsolidationResult>;
}

export class NaiveMemoryConsolidator implements MemoryConsolidator {
  constructor(private readonly store: EpisodicMemoryStore) {}

  async consolidate(agentId: AgentId, options: ConsolidateOptions): Promise<ConsolidationResult> {
    // Clamp minEpisodes to at least 1 so the non-emptiness guard below is
    // always meaningful and the first/last element accesses below cannot be
    // undefined at runtime.
    const minEpisodes = Math.max(1, options.minEpisodes ?? 1);

    // Pull everything and filter ourselves — the store doesn't have a "before"
    // query. For in-memory and small N this is fine; the Plan 07 Drizzle store
    // will expose a proper before-cutoff query.
    const all = await this.store.getRecent(agentId, Number.POSITIVE_INFINITY);
    const candidates = all.filter((ep) => ep.createdAt < options.olderThan);

    if (candidates.length < minEpisodes) {
      return { episodesRemoved: 0 };
    }

    // Oldest-first for readable summary output.
    const ordered = [...candidates].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    // Defensive: above length check guarantees these are defined, but TS
    // can't narrow that through `readonly` + noUncheckedIndexedAccess.
    if (!first || !last) {
      return { episodesRemoved: 0 };
    }

    const summary = ordered.map((ep) => `• ${ep.action} → ${ep.outcome}`).join('\n');
    const lessons = ordered
      .map((ep) => ep.lesson)
      .filter((l): l is string => Boolean(l && l.trim().length > 0));

    const consolidation = await this.store.saveConsolidation({
      agentId,
      sourceEpisodeIds: ordered.map((ep) => ep.id),
      summary,
      lessons,
      periodFrom: first.createdAt,
      periodTo: last.createdAt,
    });

    const removed = await this.store.deleteBefore(agentId, options.olderThan);

    return { consolidation, episodesRemoved: removed };
  }
}
