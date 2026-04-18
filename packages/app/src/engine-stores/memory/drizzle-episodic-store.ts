import type {
  AgentId,
  ConsolidatedMemory,
  Episode,
  EpisodicMemoryStore,
  IsoTimestamp,
  MemoryId,
  NewConsolidatedMemory,
  NewEpisode,
  Sentiment,
} from '@mynah/engine';
import { and, desc, eq, gte, lte, lt } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { consolidatedMemories, episodicMemories } from '../../db/schema.js';
import type * as schema from '../../db/schema.js';

const DEFAULT_LIMIT = 50;

function rowToEpisode(r: typeof episodicMemories.$inferSelect): Episode {
  return {
    id: r.id as MemoryId,
    agentId: r.agentId as AgentId,
    productId: r.productId,
    action: r.action,
    outcome: r.outcome,
    lesson: r.lesson ?? undefined,
    sentiment: r.sentiment as Sentiment,
    context: (r.context as Record<string, unknown> | null) ?? undefined,
    metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
    createdAt: r.createdAt.toISOString() as IsoTimestamp,
  };
}

function rowToConsolidated(r: typeof consolidatedMemories.$inferSelect): ConsolidatedMemory {
  return {
    id: r.id as MemoryId,
    agentId: r.agentId as AgentId,
    sourceEpisodeIds: r.sourceEpisodeIds as MemoryId[],
    summary: r.summary,
    lessons: r.lessons,
    periodFrom: r.periodFrom.toISOString() as IsoTimestamp,
    periodTo: r.periodTo.toISOString() as IsoTimestamp,
    consolidatedAt: r.consolidatedAt.toISOString() as IsoTimestamp,
  };
}

export class DrizzleEpisodicMemoryStore implements EpisodicMemoryStore {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async record(input: NewEpisode): Promise<Episode> {
    const [row] = await this.db
      .insert(episodicMemories)
      .values({
        agentId: input.agentId,
        productId: input.productId,
        action: input.action,
        outcome: input.outcome,
        lesson: input.lesson,
        sentiment: input.sentiment ?? 'neutral',
        context: input.context,
        metadata: input.metadata,
      })
      .returning();
    if (!row) throw new Error('episodic insert returned no row');
    return rowToEpisode(row);
  }

  async get(id: MemoryId): Promise<Episode | undefined> {
    const [row] = await this.db
      .select()
      .from(episodicMemories)
      .where(eq(episodicMemories.id, id))
      .limit(1);
    return row ? rowToEpisode(row) : undefined;
  }

  async getRecent(agentId: AgentId, limit = DEFAULT_LIMIT): Promise<readonly Episode[]> {
    const rows = await this.db
      .select()
      .from(episodicMemories)
      .where(eq(episodicMemories.agentId, agentId))
      .orderBy(desc(episodicMemories.createdAt))
      .limit(limit);
    return rows.map(rowToEpisode);
  }

  async getBetween(
    agentId: AgentId,
    from: IsoTimestamp,
    to: IsoTimestamp,
  ): Promise<readonly Episode[]> {
    const rows = await this.db
      .select()
      .from(episodicMemories)
      .where(
        and(
          eq(episodicMemories.agentId, agentId),
          gte(episodicMemories.createdAt, new Date(from)),
          lte(episodicMemories.createdAt, new Date(to)),
        ),
      )
      .orderBy(episodicMemories.createdAt);
    return rows.map(rowToEpisode);
  }

  async deleteBefore(agentId: AgentId, cutoff: IsoTimestamp): Promise<number> {
    const result = await this.db
      .delete(episodicMemories)
      .where(
        and(eq(episodicMemories.agentId, agentId), lt(episodicMemories.createdAt, new Date(cutoff))),
      )
      .returning({ id: episodicMemories.id });
    return result.length;
  }

  async saveConsolidation(input: NewConsolidatedMemory): Promise<ConsolidatedMemory> {
    const [row] = await this.db
      .insert(consolidatedMemories)
      .values({
        agentId: input.agentId,
        sourceEpisodeIds: [...input.sourceEpisodeIds],
        summary: input.summary,
        lessons: [...input.lessons],
        periodFrom: new Date(input.periodFrom),
        periodTo: new Date(input.periodTo),
      })
      .returning();
    if (!row) throw new Error('consolidation insert returned no row');
    return rowToConsolidated(row);
  }

  async getConsolidations(
    agentId: AgentId,
    limit = DEFAULT_LIMIT,
  ): Promise<readonly ConsolidatedMemory[]> {
    const rows = await this.db
      .select()
      .from(consolidatedMemories)
      .where(eq(consolidatedMemories.agentId, agentId))
      .orderBy(desc(consolidatedMemories.consolidatedAt))
      .limit(limit);
    return rows.map(rowToConsolidated);
  }
}
