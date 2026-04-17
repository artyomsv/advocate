import { and, count, desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import {
  type ContentPlan,
  contentPlans,
  discoveries,
  insights,
  type Legend,
  legendAccounts,
  legends,
  products,
} from '../db/schema.js';

export interface ProductDashboard {
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    description: string;
    url: string | null;
    valueProps: string[];
    painPoints: string[];
    talkingPoints: string[];
    neverSay: string[] | null;
    targetAudiences: unknown;
    competitorComparisons: unknown;
  };
  legendCount: number;
  activeAccountCount: number;
  queueCount: number;
  costMillicentsThisMonth: number;
}

export type ProductActivityItem =
  | {
      kind: 'content_plan';
      id: string;
      status: ContentPlan['status'];
      contentType: string;
      promotionLevel: number;
      createdAt: string;
    }
  | {
      kind: 'legend_created';
      id: string;
      firstName: string;
      lastName: string;
      createdAt: string;
    }
  | {
      kind: 'discovery';
      id: string;
      title: string;
      score: string;
      dispatched: boolean;
      createdAt: string;
    }
  | {
      kind: 'insight';
      id: string;
      body: string;
      createdAt: string;
    };

export class ProductStatsService {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async dashboard(productId: string): Promise<ProductDashboard | null> {
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    if (!product) return null;

    const [legendCountRow] = await this.db
      .select({ c: count() })
      .from(legends)
      .where(eq(legends.productId, productId));

    // Active accounts for legends under this product
    const activeAccountRows = await this.db
      .select({ c: count() })
      .from(legendAccounts)
      .innerJoin(legends, eq(legendAccounts.legendId, legends.id))
      .where(and(eq(legends.productId, productId), eq(legendAccounts.status, 'active')));

    // Content plans pending review for this product
    const queueRows = await this.db
      .select({ c: count() })
      .from(contentPlans)
      .innerJoin(legends, eq(contentPlans.legendId, legends.id))
      .where(and(eq(legends.productId, productId), eq(contentPlans.status, 'review')));

    // Cost-this-month: sum of content_plans.cost_millicents doesn't exist; placeholder 0 until Plan 11.5.
    const costMillicentsThisMonth = 0;
    void gte; // avoid unused-import once we wire the cost query
    void desc;
    void sql;

    return {
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        status: product.status,
        description: product.description,
        url: product.url,
        valueProps: product.valueProps as string[],
        painPoints: product.painPoints as string[],
        talkingPoints: product.talkingPoints as string[],
        neverSay: (product.neverSay ?? null) as string[] | null,
        targetAudiences: product.targetAudiences ?? null,
        competitorComparisons: product.competitorComparisons ?? null,
      },
      legendCount: Number(legendCountRow?.c ?? 0),
      activeAccountCount: Number(activeAccountRows[0]?.c ?? 0),
      queueCount: Number(queueRows[0]?.c ?? 0),
      costMillicentsThisMonth,
    };
  }

  async activity(productId: string, limit: number): Promise<ProductActivityItem[]> {
    const planRows = await this.db
      .select({
        id: contentPlans.id,
        status: contentPlans.status,
        contentType: contentPlans.contentType,
        promotionLevel: contentPlans.promotionLevel,
        createdAt: contentPlans.createdAt,
      })
      .from(contentPlans)
      .innerJoin(legends, eq(contentPlans.legendId, legends.id))
      .where(eq(legends.productId, productId))
      .orderBy(desc(contentPlans.createdAt))
      .limit(limit);

    const legendRows: Array<Pick<Legend, 'id' | 'firstName' | 'lastName' | 'createdAt'>> =
      await this.db
        .select({
          id: legends.id,
          firstName: legends.firstName,
          lastName: legends.lastName,
          createdAt: legends.createdAt,
        })
        .from(legends)
        .where(eq(legends.productId, productId))
        .orderBy(desc(legends.createdAt))
        .limit(limit);

    const discoveryRows = await this.db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        score: discoveries.score,
        dispatched: discoveries.dispatched,
        scannedAt: discoveries.scannedAt,
      })
      .from(discoveries)
      .where(eq(discoveries.productId, productId))
      .orderBy(desc(discoveries.scannedAt))
      .limit(limit);

    const insightRows = await this.db
      .select({
        id: insights.id,
        body: insights.body,
        generatedAt: insights.generatedAt,
      })
      .from(insights)
      .where(eq(insights.productId, productId))
      .orderBy(desc(insights.generatedAt))
      .limit(limit);

    const items: ProductActivityItem[] = [
      ...planRows.map((r) => ({
        kind: 'content_plan' as const,
        id: r.id,
        status: r.status,
        contentType: r.contentType,
        promotionLevel: r.promotionLevel,
        createdAt: r.createdAt.toISOString(),
      })),
      ...legendRows.map((r) => ({
        kind: 'legend_created' as const,
        id: r.id,
        firstName: r.firstName,
        lastName: r.lastName,
        createdAt: r.createdAt.toISOString(),
      })),
      ...discoveryRows.map((r) => ({
        kind: 'discovery' as const,
        id: r.id,
        title: r.title,
        score: r.score,
        dispatched: r.dispatched,
        createdAt: r.scannedAt.toISOString(),
      })),
      ...insightRows.map((r) => ({
        kind: 'insight' as const,
        id: r.id,
        body: r.body,
        createdAt: r.generatedAt.toISOString(),
      })),
    ];

    items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    return items.slice(0, limit);
  }
}
