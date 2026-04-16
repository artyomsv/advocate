import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { type ContentPlan, contentPlans, type NewContentPlan } from '../db/schema.js';

export class ContentPlanRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewContentPlan): Promise<ContentPlan> {
    const [row] = await this.db.insert(contentPlans).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async findById(id: string): Promise<ContentPlan | null> {
    const [row] = await this.db.select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1);
    return row ?? null;
  }

  async listByLegend(legendId: string): Promise<readonly ContentPlan[]> {
    return this.db
      .select()
      .from(contentPlans)
      .where(eq(contentPlans.legendId, legendId))
      .orderBy(desc(contentPlans.createdAt));
  }

  async listByStatus(
    status: ContentPlan['status'],
    filter?: { legendId?: string },
  ): Promise<readonly ContentPlan[]> {
    const conds = [eq(contentPlans.status, status)];
    if (filter?.legendId) conds.push(eq(contentPlans.legendId, filter.legendId));
    return this.db
      .select()
      .from(contentPlans)
      .where(and(...conds))
      .orderBy(desc(contentPlans.createdAt));
  }

  async update(id: string, patch: Partial<NewContentPlan>): Promise<ContentPlan | null> {
    const [row] = await this.db
      .update(contentPlans)
      .set(patch)
      .where(eq(contentPlans.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db
      .delete(contentPlans)
      .where(eq(contentPlans.id, id))
      .returning({ id: contentPlans.id });
    return result.length > 0;
  }
}
