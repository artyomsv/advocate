import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { contentPlans, legends, llmUsage } from '../db/schema.js';

/**
 * Static roster. Agent identities are hand-coded today — they don't have rows
 * in the agents table yet (that landed with the engine but isn't populated by
 * the app). When Plan 11.5 moves agents into the DB this reads from there.
 */
export const AGENT_ROSTER = [
  {
    agentId: 'campaign-lead',
    name: 'Campaign Lead',
    role: 'Final decision: post, revise, reject',
    taskTypes: [] as string[],
  },
  {
    agentId: 'strategist',
    name: 'Strategist',
    role: 'Picks legend + community + plan',
    taskTypes: ['strategy'],
  },
  {
    agentId: 'content-writer',
    name: 'Content Writer',
    role: 'Drafts the post',
    taskTypes: ['content_writing'],
  },
  {
    agentId: 'quality-gate',
    name: 'Quality Gate',
    role: 'LLM review + scoring',
    taskTypes: ['classification'],
  },
  {
    agentId: 'safety-worker',
    name: 'Safety Worker',
    role: 'Rules-based safety checks',
    taskTypes: [],
  },
] as const;

export interface AgentStatus {
  agentId: string;
  name: string;
  role: string;
  status: 'ready' | 'running' | 'idle' | 'error';
  lastRunAt: string | null;
  runsToday: number;
  costMillicentsToday: number;
  providers: string[];
}

export interface AgentActivityStep {
  agent: string;
  summary: string;
  provider?: string;
  model?: string;
  costMillicents?: number;
}

export interface AgentActivityItem {
  contentPlanId: string;
  status: string;
  createdAt: string;
  promotionLevel: number;
  contentType: string;
  rejectionReason: string | null;
  pipeline: AgentActivityStep[];
  totalCostMillicents: number;
}

export class AgentStatsService {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async status(productId: string | null): Promise<AgentStatus[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const out: AgentStatus[] = [];
    for (const agent of AGENT_ROSTER) {
      if (agent.taskTypes.length === 0) {
        // No LLM-backed task types — infer from reviewedAt on content_plans.
        const row = await this.reviewedByInfo(agent.agentId, productId);
        out.push({
          agentId: agent.agentId,
          name: agent.name,
          role: agent.role,
          status: row.lastRunAt ? 'ready' : 'idle',
          lastRunAt: row.lastRunAt,
          runsToday: row.runsToday,
          costMillicentsToday: 0,
          providers: row.providers,
        });
        continue;
      }

      const rows = await this.db
        .select({
          createdAt: llmUsage.createdAt,
          costMillicents: llmUsage.costMillicents,
          provider: llmUsage.provider,
        })
        .from(llmUsage)
        .where(this.#taskTypeFilter(agent.taskTypes))
        .orderBy(desc(llmUsage.createdAt))
        .limit(200);

      const todayRows = rows.filter((r) => r.createdAt >= today);
      const providers = Array.from(new Set(rows.map((r) => r.provider)));

      out.push({
        agentId: agent.agentId,
        name: agent.name,
        role: agent.role,
        status: rows[0]
          ? Date.now() - rows[0].createdAt.getTime() < 60_000
            ? 'running'
            : 'ready'
          : 'idle',
        lastRunAt: rows[0]?.createdAt.toISOString() ?? null,
        runsToday: todayRows.length,
        costMillicentsToday: todayRows.reduce((s, r) => s + r.costMillicents, 0),
        providers,
      });
    }
    return out;
  }

  #taskTypeFilter(taskTypes: readonly string[]) {
    if (taskTypes.length === 1) return eq(llmUsage.taskType, taskTypes[0]!);
    return sql`${llmUsage.taskType} = ANY(${taskTypes as unknown as string[]})`;
  }

  async reviewedByInfo(
    agentId: string,
    productId: string | null,
  ): Promise<{ lastRunAt: string | null; runsToday: number; providers: string[] }> {
    // For campaign-lead + safety-worker we use content_plans.reviewedAt / status
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseQuery = productId
      ? this.db
          .select({ createdAt: contentPlans.createdAt, reviewedAt: contentPlans.reviewedAt })
          .from(contentPlans)
          .innerJoin(legends, eq(contentPlans.legendId, legends.id))
          .where(eq(legends.productId, productId))
          .orderBy(desc(contentPlans.createdAt))
          .limit(200)
      : this.db
          .select({ createdAt: contentPlans.createdAt, reviewedAt: contentPlans.reviewedAt })
          .from(contentPlans)
          .orderBy(desc(contentPlans.createdAt))
          .limit(200);

    const rows = await baseQuery;
    const ts = rows
      .map((r) => r.reviewedAt ?? r.createdAt)
      .filter((d): d is Date => d instanceof Date);
    const todayRows = ts.filter((d) => d >= today);
    void agentId;
    return {
      lastRunAt: ts[0]?.toISOString() ?? null,
      runsToday: todayRows.length,
      providers: [],
    };
  }

  async activity(productId: string | null, limit: number): Promise<AgentActivityItem[]> {
    const q = productId
      ? this.db
          .select({
            id: contentPlans.id,
            status: contentPlans.status,
            createdAt: contentPlans.createdAt,
            promotionLevel: contentPlans.promotionLevel,
            contentType: contentPlans.contentType,
            rejectionReason: contentPlans.rejectionReason,
            reviewedBy: contentPlans.reviewedBy,
            qualityScore: contentPlans.qualityScore,
            generatedContent: contentPlans.generatedContent,
            threadContext: contentPlans.threadContext,
          })
          .from(contentPlans)
          .innerJoin(legends, eq(contentPlans.legendId, legends.id))
          .where(eq(legends.productId, productId))
          .orderBy(desc(contentPlans.createdAt))
          .limit(limit)
      : this.db
          .select({
            id: contentPlans.id,
            status: contentPlans.status,
            createdAt: contentPlans.createdAt,
            promotionLevel: contentPlans.promotionLevel,
            contentType: contentPlans.contentType,
            rejectionReason: contentPlans.rejectionReason,
            reviewedBy: contentPlans.reviewedBy,
            qualityScore: contentPlans.qualityScore,
            generatedContent: contentPlans.generatedContent,
            threadContext: contentPlans.threadContext,
          })
          .from(contentPlans)
          .orderBy(desc(contentPlans.createdAt))
          .limit(limit);

    const plans = await q;
    const items: AgentActivityItem[] = [];

    for (const p of plans) {
      const pipeline: AgentActivityStep[] = [];
      let total = 0;

      // Correlate llm_usage rows by narrow time window around the plan's createdAt
      const window = 30_000;
      const from = new Date(p.createdAt.getTime() - window);
      const to = new Date(p.createdAt.getTime() + window);
      const usage = await this.db
        .select({
          taskType: llmUsage.taskType,
          provider: llmUsage.provider,
          model: llmUsage.model,
          costMillicents: llmUsage.costMillicents,
        })
        .from(llmUsage)
        .where(and(gte(llmUsage.createdAt, from), sql`${llmUsage.createdAt} <= ${to}`));

      const byTask = new Map<string, (typeof usage)[number]>();
      for (const u of usage) {
        if (!byTask.has(u.taskType)) byTask.set(u.taskType, u);
        total += u.costMillicents;
      }

      pipeline.push({
        agent: 'Campaign Lead',
        summary:
          p.status === 'rejected' && p.rejectionReason
            ? `decided: reject — ${p.rejectionReason.slice(0, 80)}`
            : p.status === 'approved'
              ? 'decided: post'
              : p.status === 'review'
                ? 'needs human review'
                : `status: ${p.status}`,
      });

      pipeline.push({
        agent: 'Safety Worker',
        summary:
          p.status === 'rejected' && p.rejectionReason?.toLowerCase().includes('safety')
            ? `blocked: ${p.rejectionReason}`
            : 'cleared (rules)',
      });

      const quality = byTask.get('classification');
      const q = p.qualityScore as { overall?: number } | null;
      pipeline.push({
        agent: 'Quality Gate',
        summary: q?.overall ? `score ${q.overall}/10` : 'reviewed',
        provider: quality?.provider,
        model: quality?.model,
        costMillicents: quality?.costMillicents,
      });

      const writer = byTask.get('content_writing');
      pipeline.push({
        agent: 'Content Writer',
        summary: p.generatedContent
          ? `${p.generatedContent.length} chars`
          : '(no content)',
        provider: writer?.provider,
        model: writer?.model,
        costMillicents: writer?.costMillicents,
      });

      const strat = byTask.get('strategy');
      pipeline.push({
        agent: 'Strategist',
        summary: p.threadContext ? p.threadContext.slice(0, 80) : 'picked plan',
        provider: strat?.provider,
        model: strat?.model,
        costMillicents: strat?.costMillicents,
      });

      items.push({
        contentPlanId: p.id,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
        promotionLevel: p.promotionLevel,
        contentType: p.contentType,
        rejectionReason: p.rejectionReason,
        pipeline,
        totalCostMillicents: total,
      });
    }

    return items;
  }
}
