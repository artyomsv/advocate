import { randomUUID } from 'node:crypto';
import { isoNow, type IsoTimestamp } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';
import type { ConsolidatedMemory, Episode, NewConsolidatedMemory, NewEpisode } from './types.js';

/**
 * Persistence contract for episodic memory. Plan 07 provides a Drizzle-backed
 * implementation; `InMemoryEpisodicStore` below is a reference + test impl.
 */
export interface EpisodicMemoryStore {
  record(episode: NewEpisode): Promise<Episode>;
  get(id: MemoryId): Promise<Episode | undefined>;
  getRecent(agentId: AgentId, limit?: number): Promise<readonly Episode[]>;
  getBetween(agentId: AgentId, from: IsoTimestamp, to: IsoTimestamp): Promise<readonly Episode[]>;
  /** Returns number of episodes removed. */
  deleteBefore(agentId: AgentId, cutoff: IsoTimestamp): Promise<number>;

  saveConsolidation(input: NewConsolidatedMemory): Promise<ConsolidatedMemory>;
  getConsolidations(agentId: AgentId, limit?: number): Promise<readonly ConsolidatedMemory[]>;
}

const DEFAULT_RECENT_LIMIT = 50;

export class InMemoryEpisodicStore implements EpisodicMemoryStore {
  readonly #episodes = new Map<MemoryId, Episode>();
  readonly #consolidations = new Map<MemoryId, ConsolidatedMemory>();

  async record(input: NewEpisode): Promise<Episode> {
    const episode: Episode = {
      id: randomUUID() as MemoryId,
      agentId: input.agentId,
      action: input.action,
      outcome: input.outcome,
      lesson: input.lesson,
      sentiment: input.sentiment ?? 'neutral',
      context: input.context,
      metadata: input.metadata,
      createdAt: isoNow(),
    };
    this.#episodes.set(episode.id, episode);
    return episode;
  }

  async get(id: MemoryId): Promise<Episode | undefined> {
    return this.#episodes.get(id);
  }

  async getRecent(agentId: AgentId, limit = DEFAULT_RECENT_LIMIT): Promise<readonly Episode[]> {
    return this.#filter(agentId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async getBetween(
    agentId: AgentId,
    from: IsoTimestamp,
    to: IsoTimestamp,
  ): Promise<readonly Episode[]> {
    return this.#filter(agentId)
      .filter((ep) => ep.createdAt >= from && ep.createdAt <= to)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async deleteBefore(agentId: AgentId, cutoff: IsoTimestamp): Promise<number> {
    let removed = 0;
    for (const ep of this.#filter(agentId)) {
      if (ep.createdAt < cutoff) {
        this.#episodes.delete(ep.id);
        removed += 1;
      }
    }
    return removed;
  }

  async saveConsolidation(input: NewConsolidatedMemory): Promise<ConsolidatedMemory> {
    const consolidation: ConsolidatedMemory = {
      ...input,
      id: randomUUID() as MemoryId,
      consolidatedAt: isoNow(),
    };
    this.#consolidations.set(consolidation.id, consolidation);
    return consolidation;
  }

  async getConsolidations(
    agentId: AgentId,
    limit = DEFAULT_RECENT_LIMIT,
  ): Promise<readonly ConsolidatedMemory[]> {
    return Array.from(this.#consolidations.values())
      .filter((c) => c.agentId === agentId)
      .sort((a, b) => (a.consolidatedAt < b.consolidatedAt ? 1 : -1))
      .slice(0, limit);
  }

  #filter(agentId: AgentId): Episode[] {
    const out: Episode[] = [];
    for (const ep of this.#episodes.values()) {
      if (ep.agentId === agentId) out.push(ep);
    }
    return out;
  }
}
