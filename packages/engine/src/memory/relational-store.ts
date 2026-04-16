import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';
import type { NewRelationship, Relationship, Sentiment } from './types.js';

export interface RelationalMemoryStore {
  /** Creates on first call; increments interactionCount and refreshes fields on subsequent calls. */
  upsert(input: NewRelationship): Promise<Relationship>;
  get(id: MemoryId): Promise<Relationship | undefined>;
  findByUsername(
    agentId: AgentId,
    platform: string,
    externalUsername: string,
  ): Promise<Relationship | undefined>;
  listForAgent(agentId: AgentId): Promise<readonly Relationship[]>;
  updateSentiment(id: MemoryId, sentiment: Sentiment): Promise<Relationship>;
  incrementInteraction(id: MemoryId): Promise<Relationship>;
}

function key(agentId: AgentId, platform: string, username: string): string {
  return `${agentId}::${platform}::${username}`;
}

export class InMemoryRelationalStore implements RelationalMemoryStore {
  readonly #byId = new Map<MemoryId, Relationship>();
  readonly #byLookup = new Map<string, MemoryId>();

  async upsert(input: NewRelationship): Promise<Relationship> {
    const lookup = key(input.agentId, input.platform, input.externalUsername);
    const existingId = this.#byLookup.get(lookup);
    if (existingId) {
      const existing = this.#byId.get(existingId);
      if (!existing) throw new Error('index inconsistency: id present, row missing');
      const updated: Relationship = {
        ...existing,
        context: input.context,
        sentiment: input.sentiment ?? existing.sentiment,
        notes: input.notes ?? existing.notes,
        tags: input.tags ?? existing.tags,
        interactionCount: existing.interactionCount + 1,
        lastInteractionAt: isoNow(),
      };
      this.#byId.set(existing.id, updated);
      return updated;
    }

    const created: Relationship = {
      id: randomUUID() as MemoryId,
      agentId: input.agentId,
      externalUsername: input.externalUsername,
      platform: input.platform,
      context: input.context,
      sentiment: input.sentiment ?? 'neutral',
      interactionCount: 1,
      lastInteractionAt: isoNow(),
      notes: input.notes,
      tags: input.tags ?? [],
    };
    this.#byId.set(created.id, created);
    this.#byLookup.set(lookup, created.id);
    return created;
  }

  async get(id: MemoryId): Promise<Relationship | undefined> {
    return this.#byId.get(id);
  }

  async findByUsername(
    agentId: AgentId,
    platform: string,
    externalUsername: string,
  ): Promise<Relationship | undefined> {
    const id = this.#byLookup.get(key(agentId, platform, externalUsername));
    return id ? this.#byId.get(id) : undefined;
  }

  async listForAgent(agentId: AgentId): Promise<readonly Relationship[]> {
    const out: Relationship[] = [];
    for (const rel of this.#byId.values()) {
      if (rel.agentId === agentId) out.push(rel);
    }
    return out.sort((a, b) => (a.lastInteractionAt < b.lastInteractionAt ? 1 : -1));
  }

  async updateSentiment(id: MemoryId, sentiment: Sentiment): Promise<Relationship> {
    const existing = this.#byId.get(id);
    if (!existing) throw new Error(`Relationship ${id} not found`);
    const updated: Relationship = { ...existing, sentiment };
    this.#byId.set(id, updated);
    return updated;
  }

  async incrementInteraction(id: MemoryId): Promise<Relationship> {
    const existing = this.#byId.get(id);
    if (!existing) throw new Error(`Relationship ${id} not found`);
    const updated: Relationship = {
      ...existing,
      interactionCount: existing.interactionCount + 1,
      lastInteractionAt: isoNow(),
    };
    this.#byId.set(id, updated);
    return updated;
  }
}
