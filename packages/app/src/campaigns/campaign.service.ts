import { and, desc, eq, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { z } from 'zod';
import { type Campaign, campaigns, contentPlans, type NewCampaign } from '../db/schema.js';
import type * as schema from '../db/schema.js';

export const campaignCreateSchema = z.object({
  productId: z.string().uuid(),
  name: z.string().min(1).max(300),
  description: z.string().optional(),
  strategy: z.string().optional(),
  legendIds: z.array(z.string().uuid()).default([]),
  communityIds: z.array(z.string().uuid()).default([]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['planned', 'active', 'paused', 'completed']).default('planned'),
});
export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

export const campaignUpdateSchema = campaignCreateSchema.partial().extend({
  productId: campaignCreateSchema.shape.productId.optional(),
});
export type CampaignUpdateInput = z.infer<typeof campaignUpdateSchema>;

export class CampaignNotFoundError extends Error {
  constructor(id: string) {
    super(`Campaign ${id} not found`);
    this.name = 'CampaignNotFoundError';
  }
}

export interface CampaignWithStats extends Campaign {
  stats: {
    totalPlans: number;
    reviewPlans: number;
    approvedPlans: number;
    postedPlans: number;
    rejectedPlans: number;
  };
}

export class CampaignService {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: unknown): Promise<Campaign> {
    const parsed = campaignCreateSchema.parse(input);
    const values: NewCampaign = {
      productId: parsed.productId,
      name: parsed.name,
      description: parsed.description ?? null,
      strategy: parsed.strategy ?? null,
      legendIds: parsed.legendIds,
      communityIds: parsed.communityIds,
      startDate: parsed.startDate ?? null,
      endDate: parsed.endDate ?? null,
      status: parsed.status,
    };
    const [row] = await this.db.insert(campaigns).values(values).returning();
    if (!row) throw new Error('campaign insert returned no row');
    return row;
  }

  async list(productId?: string): Promise<readonly Campaign[]> {
    const q = this.db.select().from(campaigns);
    const rows = productId
      ? await q.where(eq(campaigns.productId, productId)).orderBy(desc(campaigns.createdAt))
      : await q.orderBy(desc(campaigns.createdAt));
    return rows;
  }

  async listWithStats(productId?: string): Promise<readonly CampaignWithStats[]> {
    const rows = await this.list(productId);
    if (rows.length === 0) return [];

    const statRows = await this.db
      .select({
        campaignId: contentPlans.campaignId,
        status: contentPlans.status,
        total: sql<number>`COUNT(*)::int`,
      })
      .from(contentPlans)
      .groupBy(contentPlans.campaignId, contentPlans.status);

    // Build per-campaign tallies.
    const tallies = new Map<string, CampaignWithStats['stats']>();
    for (const r of statRows) {
      if (!r.campaignId) continue;
      const existing = tallies.get(r.campaignId) ?? {
        totalPlans: 0,
        reviewPlans: 0,
        approvedPlans: 0,
        postedPlans: 0,
        rejectedPlans: 0,
      };
      existing.totalPlans += r.total;
      if (r.status === 'review') existing.reviewPlans += r.total;
      if (r.status === 'approved') existing.approvedPlans += r.total;
      if (r.status === 'posted') existing.postedPlans += r.total;
      if (r.status === 'rejected') existing.rejectedPlans += r.total;
      tallies.set(r.campaignId, existing);
    }

    return rows.map((c) => ({
      ...c,
      stats: tallies.get(c.id) ?? {
        totalPlans: 0,
        reviewPlans: 0,
        approvedPlans: 0,
        postedPlans: 0,
        rejectedPlans: 0,
      },
    }));
  }

  async get(id: string): Promise<Campaign> {
    const [row] = await this.db.select().from(campaigns).where(eq(campaigns.id, id)).limit(1);
    if (!row) throw new CampaignNotFoundError(id);
    return row;
  }

  async update(id: string, input: unknown): Promise<Campaign> {
    const parsed = campaignUpdateSchema.parse(input);
    const patch: Partial<NewCampaign> = {
      updatedAt: new Date(),
    };
    if (parsed.name !== undefined) patch.name = parsed.name;
    if (parsed.description !== undefined) patch.description = parsed.description;
    if (parsed.strategy !== undefined) patch.strategy = parsed.strategy;
    if (parsed.legendIds !== undefined) patch.legendIds = parsed.legendIds;
    if (parsed.communityIds !== undefined) patch.communityIds = parsed.communityIds;
    if (parsed.startDate !== undefined) patch.startDate = parsed.startDate;
    if (parsed.endDate !== undefined) patch.endDate = parsed.endDate;
    if (parsed.status !== undefined) patch.status = parsed.status;
    const [row] = await this.db
      .update(campaigns)
      .set(patch)
      .where(eq(campaigns.id, id))
      .returning();
    if (!row) throw new CampaignNotFoundError(id);
    return row;
  }

  async remove(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(campaigns)
      .where(eq(campaigns.id, id))
      .returning({ id: campaigns.id });
    return rows.length > 0;
  }

  async listActiveForProduct(productId: string): Promise<readonly Campaign[]> {
    return this.db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.productId, productId), eq(campaigns.status, 'active')))
      .orderBy(desc(campaigns.createdAt));
  }
}
