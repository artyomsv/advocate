import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import { agentMessages, contentPlans, legends, llmUsage } from '../db/schema.js';
import type * as schema from '../db/schema.js';

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
  {
    agentId: 'scout',
    name: 'Scout',
    role: 'Scans communities for dispatch candidates',
    taskTypes: ['classification'],
  },
  {
    agentId: 'analytics-analyst',
    name: 'Analytics Analyst',
    role: 'Distills insights from post metrics',
    taskTypes: ['strategy'],
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
  /**
   * Full message body when available (traced runs only). Legacy reconstructed
   * runs leave this undefined.
   */
  content?: string;
  /** ISO timestamp of the step — only present for traced runs. */
  at?: string;
  provider?: string;
  model?: string;
  costMillicents?: number;
}

const AGENT_NAME_BY_ID: Record<string, string> = {
  [SEED_AGENT_IDS.campaignLead]: 'Campaign Lead',
  [SEED_AGENT_IDS.strategist]: 'Strategist',
  [SEED_AGENT_IDS.contentWriter]: 'Content Writer',
  [SEED_AGENT_IDS.qualityGate]: 'Quality Gate',
  [SEED_AGENT_IDS.safetyWorker]: 'Safety Worker',
  [SEED_AGENT_IDS.scout]: 'Scout',
  [SEED_AGENT_IDS.analyticsAnalyst]: 'Analytics Analyst',
};

/** Bridges the kebab-case ids used in AGENT_ROSTER to the seeded UUIDs. */
const AGENT_UUID_BY_KEBAB: Record<string, string> = {
  'campaign-lead': SEED_AGENT_IDS.campaignLead,
  strategist: SEED_AGENT_IDS.strategist,
  'content-writer': SEED_AGENT_IDS.contentWriter,
  'quality-gate': SEED_AGENT_IDS.qualityGate,
  'safety-worker': SEED_AGENT_IDS.safetyWorker,
  scout: SEED_AGENT_IDS.scout,
  'analytics-analyst': SEED_AGENT_IDS.analyticsAnalyst,
};

export interface AgentRecentMessage {
  id: string;
  subject: string;
  content: string;
  toAgent: string;
  toAgentName: string;
  type: string;
  taskId: string | null;
  createdAt: string;
  costMillicents: number | null;
}

export interface AgentDetail {
  agentId: string;
  name: string;
  role: string;
  totalCostMillicentsToday: number;
  totalCostMillicentsMonth: number;
  runsMonth: number;
  recentMessages: AgentRecentMessage[];
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

  async detail(kebabOrUuid: string): Promise<AgentDetail | null> {
    const uuid = AGENT_UUID_BY_KEBAB[kebabOrUuid] ?? kebabOrUuid;
    const rosterEntry = AGENT_ROSTER.find(
      (a) => a.agentId === kebabOrUuid || AGENT_UUID_BY_KEBAB[a.agentId] === uuid,
    );
    if (!rosterEntry) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

    // Last 10 messages this agent SENT
    const recentRows = await this.db
      .select()
      .from(agentMessages)
      .where(eq(agentMessages.fromAgent, uuid))
      .orderBy(desc(agentMessages.createdAt))
      .limit(10);

    const recentMessages: AgentRecentMessage[] = recentRows.map((r) => {
      const meta = (r.metadata ?? {}) as { costMillicents?: number };
      return {
        id: r.id,
        subject: r.subject,
        content: r.content,
        toAgent: r.toAgent,
        toAgentName: AGENT_NAME_BY_ID[r.toAgent] ?? r.toAgent,
        type: r.type,
        taskId: r.taskId,
        createdAt: r.createdAt.toISOString(),
        costMillicents: typeof meta.costMillicents === 'number' ? meta.costMillicents : null,
      };
    });

    // Cost filtered by the agent's task types. Roster entries without
    // taskTypes (campaign-lead, safety-worker) fall back to counting their
    // messages as "runs" with no LLM cost.
    let totalCostToday = 0;
    let totalCostMonth = 0;
    let runsMonth = 0;

    if (rosterEntry.taskTypes.length > 0) {
      const usageRows = await this.db
        .select({
          createdAt: llmUsage.createdAt,
          costMillicents: llmUsage.costMillicents,
        })
        .from(llmUsage)
        .where(
          and(
            gte(llmUsage.createdAt, monthStart),
            this.#taskTypeFilter(rosterEntry.taskTypes),
          ),
        );
      for (const r of usageRows) {
        totalCostMonth += r.costMillicents;
        if (r.createdAt >= today) totalCostToday += r.costMillicents;
      }
      runsMonth = usageRows.length;
    } else {
      // Roster agent without LLM-backed tasks — approximate runs by messages.
      const [row] = await this.db
        .select({ c: sql<number>`COUNT(*)::int` })
        .from(agentMessages)
        .where(and(eq(agentMessages.fromAgent, uuid), gte(agentMessages.createdAt, monthStart)));
      runsMonth = row?.c ?? 0;
    }

    return {
      agentId: rosterEntry.agentId,
      name: rosterEntry.name,
      role: rosterEntry.role,
      totalCostMillicentsToday: totalCostToday,
      totalCostMillicentsMonth: totalCostMonth,
      runsMonth,
      recentMessages,
    };
  }

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
            traceTaskId: contentPlans.traceTaskId,
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
            traceTaskId: contentPlans.traceTaskId,
          })
          .from(contentPlans)
          .orderBy(desc(contentPlans.createdAt))
          .limit(limit);

    const plans = await q;

    // Batch-fetch agent_messages for every plan that has a traceTaskId in
    // one query — avoids N+1 against the activity page.
    const traceTaskIds = plans
      .map((p) => p.traceTaskId)
      .filter((id): id is string => id !== null && id !== undefined);
    const messageRows =
      traceTaskIds.length > 0
        ? await this.db
            .select()
            .from(agentMessages)
            .where(inArray(agentMessages.taskId, traceTaskIds))
            .orderBy(asc(agentMessages.createdAt))
        : [];
    const messagesByTask = new Map<string, typeof messageRows>();
    for (const m of messageRows) {
      if (!m.taskId) continue;
      const arr = messagesByTask.get(m.taskId) ?? [];
      arr.push(m);
      messagesByTask.set(m.taskId, arr);
    }

    const items: AgentActivityItem[] = [];

    for (const p of plans) {
      const traced = p.traceTaskId ? messagesByTask.get(p.traceTaskId) : undefined;
      if (traced && traced.length > 0) {
        let tracedTotal = 0;
        const pipeline: AgentActivityStep[] = traced.map((m) => {
          const meta = (m.metadata ?? {}) as {
            costMillicents?: number;
            provider?: string;
            model?: string;
          };
          if (typeof meta.costMillicents === 'number') tracedTotal += meta.costMillicents;
          return {
            agent: AGENT_NAME_BY_ID[m.fromAgent] ?? m.fromAgent,
            summary: m.subject,
            content: m.content,
            at: m.createdAt.toISOString(),
            provider: meta.provider,
            model: meta.model,
            costMillicents: meta.costMillicents,
          };
        });
        items.push({
          contentPlanId: p.id,
          status: p.status,
          createdAt: p.createdAt.toISOString(),
          promotionLevel: p.promotionLevel,
          contentType: p.contentType,
          rejectionReason: p.rejectionReason,
          pipeline,
          totalCostMillicents: tracedTotal,
        });
        continue;
      }

      // Legacy fallback: reconstructed pipeline for rows that predate
      // trace persistence.
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
