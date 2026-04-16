import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { type Legend, legends, type NewLegend } from '../db/schema.js';

/**
 * Thin Drizzle query wrapper. Does NOT validate inputs — the service layer
 * does. Does NOT map DB errors to domain errors — callers handle that.
 */
export class LegendRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewLegend): Promise<Legend> {
    const [row] = await this.db.insert(legends).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async findById(id: string): Promise<Legend | null> {
    const [row] = await this.db.select().from(legends).where(eq(legends.id, id)).limit(1);
    return row ?? null;
  }

  async list(filter?: { productId?: string }): Promise<readonly Legend[]> {
    if (filter?.productId) {
      return this.db
        .select()
        .from(legends)
        .where(eq(legends.productId, filter.productId))
        .orderBy(desc(legends.createdAt));
    }
    return this.db.select().from(legends).orderBy(desc(legends.createdAt));
  }

  async update(id: string, patch: Partial<NewLegend>): Promise<Legend | null> {
    const [row] = await this.db
      .update(legends)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(legends.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db
      .delete(legends)
      .where(eq(legends.id, id))
      .returning({ id: legends.id });
    return result.length > 0;
  }
}
