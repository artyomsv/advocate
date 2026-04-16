import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  type LegendAccount,
  legendAccounts,
  type NewLegendAccount,
} from '../db/schema/app/legends.js';
import type * as schema from '../db/schema.js';

export class LegendAccountRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewLegendAccount): Promise<LegendAccount> {
    const [row] = await this.db.insert(legendAccounts).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async findById(id: string): Promise<LegendAccount | null> {
    const [row] = await this.db
      .select()
      .from(legendAccounts)
      .where(eq(legendAccounts.id, id))
      .limit(1);
    return row ?? null;
  }

  async findByLegendAndPlatform(legendId: string, platform: string): Promise<LegendAccount | null> {
    const [row] = await this.db
      .select()
      .from(legendAccounts)
      .where(and(eq(legendAccounts.legendId, legendId), eq(legendAccounts.platform, platform)))
      .limit(1);
    return row ?? null;
  }

  async list(filter?: { legendId?: string; platform?: string }): Promise<readonly LegendAccount[]> {
    const conditions = [];
    if (filter?.legendId) conditions.push(eq(legendAccounts.legendId, filter.legendId));
    if (filter?.platform) conditions.push(eq(legendAccounts.platform, filter.platform));

    const query = this.db.select().from(legendAccounts);
    if (conditions.length > 0) {
      return query.where(and(...conditions)).orderBy(desc(legendAccounts.createdAt));
    }
    return query.orderBy(desc(legendAccounts.createdAt));
  }

  async update(id: string, patch: Partial<NewLegendAccount>): Promise<LegendAccount | null> {
    const [row] = await this.db
      .update(legendAccounts)
      .set(patch)
      .where(eq(legendAccounts.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db
      .delete(legendAccounts)
      .where(eq(legendAccounts.id, id))
      .returning({ id: legendAccounts.id });
    return result.length > 0;
  }
}
