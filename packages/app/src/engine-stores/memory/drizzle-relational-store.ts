import type {
  AgentId,
  IsoTimestamp,
  MemoryId,
  NewRelationship,
  RelationalMemoryStore,
  Relationship,
  Sentiment,
} from '@mynah/engine';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../../db/schema.js';
import { relationalMemories } from '../../db/schema.js';

function rowToRelationship(r: typeof relationalMemories.$inferSelect): Relationship {
  return {
    id: r.id as MemoryId,
    agentId: r.agentId as AgentId,
    productId: r.productId,
    externalUsername: r.externalUsername,
    platform: r.platform,
    context: r.context,
    sentiment: r.sentiment as Sentiment,
    interactionCount: r.interactionCount,
    lastInteractionAt: r.lastInteractionAt.toISOString() as IsoTimestamp,
    notes: r.notes ?? undefined,
    tags: r.tags ?? [],
  };
}

export class DrizzleRelationalMemoryStore implements RelationalMemoryStore {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async upsert(input: NewRelationship): Promise<Relationship> {
    const existing = await this.findByUsername(
      input.agentId,
      input.platform,
      input.externalUsername,
    );

    if (existing) {
      const [row] = await this.db
        .update(relationalMemories)
        .set({
          context: input.context,
          sentiment: input.sentiment ?? existing.sentiment,
          notes: input.notes ?? existing.notes,
          tags: input.tags ? [...input.tags] : (existing.tags as string[]),
          interactionCount: existing.interactionCount + 1,
          lastInteractionAt: new Date(),
        })
        .where(eq(relationalMemories.id, existing.id))
        .returning();
      if (!row) throw new Error('relationship update returned no row');
      return rowToRelationship(row);
    }

    const [row] = await this.db
      .insert(relationalMemories)
      .values({
        agentId: input.agentId,
        productId: input.productId,
        externalUsername: input.externalUsername,
        platform: input.platform,
        context: input.context,
        sentiment: input.sentiment ?? 'neutral',
        notes: input.notes,
        tags: input.tags ? [...input.tags] : [],
      })
      .returning();
    if (!row) throw new Error('relationship insert returned no row');
    return rowToRelationship(row);
  }

  async get(id: MemoryId): Promise<Relationship | undefined> {
    const [row] = await this.db
      .select()
      .from(relationalMemories)
      .where(eq(relationalMemories.id, id))
      .limit(1);
    return row ? rowToRelationship(row) : undefined;
  }

  async findByUsername(
    agentId: AgentId,
    platform: string,
    externalUsername: string,
  ): Promise<Relationship | undefined> {
    const [row] = await this.db
      .select()
      .from(relationalMemories)
      .where(
        and(
          eq(relationalMemories.agentId, agentId),
          eq(relationalMemories.platform, platform),
          eq(relationalMemories.externalUsername, externalUsername),
        ),
      )
      .limit(1);
    return row ? rowToRelationship(row) : undefined;
  }

  async listForAgent(agentId: AgentId): Promise<readonly Relationship[]> {
    const rows = await this.db
      .select()
      .from(relationalMemories)
      .where(eq(relationalMemories.agentId, agentId))
      .orderBy(desc(relationalMemories.lastInteractionAt));
    return rows.map(rowToRelationship);
  }

  async updateSentiment(id: MemoryId, sentiment: Sentiment): Promise<Relationship> {
    const [row] = await this.db
      .update(relationalMemories)
      .set({ sentiment })
      .where(eq(relationalMemories.id, id))
      .returning();
    if (!row) throw new Error(`Relationship ${id} not found`);
    return rowToRelationship(row);
  }

  async incrementInteraction(id: MemoryId): Promise<Relationship> {
    const [row] = await this.db
      .update(relationalMemories)
      .set({
        interactionCount: sql`${relationalMemories.interactionCount} + 1`,
        lastInteractionAt: new Date(),
      })
      .where(eq(relationalMemories.id, id))
      .returning();
    if (!row) throw new Error(`Relationship ${id} not found`);
    return rowToRelationship(row);
  }
}
