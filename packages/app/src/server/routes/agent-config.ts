import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { CAMPAIGN_LEAD_SYSTEM_PROMPT } from '../../agents/campaign-lead.js';
import { MEMORY_CONSOLIDATOR_SYSTEM_PROMPT } from '../../agents/memory-consolidator.js';
import { QUALITY_GATE_SYSTEM_PROMPT } from '../../agents/quality-gate.js';
import { invalidateSoulCache } from '../../agents/soul-loader.js';
import { STRATEGIST_SYSTEM_PROMPT } from '../../agents/strategist.js';
import { SEED_AGENT_IDS } from '../../bootstrap/seed-agents.js';
import { getEnv } from '../../config/env.js';
import { getDb } from '../../db/connection.js';
import { agents } from '../../db/schema.js';
import { createDefaultRouter, DEFAULT_ROUTES } from '../../llm/default-router.js';
import { getRedis } from '../../queue/connection.js';
import { type MemoryConsolidateJobData, QUEUE_NAMES } from '../../worker/queues.js';

interface AgentConfigEntry {
  agentId: string;
  name: string;
  role: string;
  taskType: string | null;
  systemPrompt: string;
  /**
   * When true, the systemPrompt above is assembled dynamically (soul + product
   * knowledge + context) per call — the string here is a description, not the
   * literal prompt.
   */
  dynamic: boolean;
}

const SCOUT_PROMPT =
  'You are a content-promotion scout. Given a product brief and a list of forum threads, ' +
  'score each thread 0-10 for how well the product genuinely fits the discussion. 10 = the ' +
  'OP is actively asking for this exact thing; 0 = unrelated.';

const ANALYTICS_PROMPT =
  'You are the Analytics Analyst for a content-promotion system. Produce concise, actionable learnings.';

const WRITER_DYNAMIC_DESCRIPTION =
  '[Dynamic: assembled per call by prompts/composer.ts] ' +
  'Layer 1 — Soul (legend identity built from legend.firstName/lastName/age/occupation, ' +
  'personality Big Five, writing style, expertise gaps, never-do list). ' +
  'Layer 2 — Product Knowledge (value props, pain points, talking points filtered by promotion level). ' +
  'Layer 3 — Context (community rules, thread summary, recent activity).';

const SAFETY_DESCRIPTION =
  '[Rules-based, no LLM] Evaluates legend_accounts row against configured limits: ' +
  'posts per day cap, minimum gap between posts, maturity-gated promotion level, ' +
  'account warm-up phase. Returns {allowed, reason, nextPossibleAt}.';

const AGENTS: readonly AgentConfigEntry[] = [
  {
    agentId: 'campaign-lead',
    name: 'Campaign Lead',
    role: 'Final decision: post, revise, reject, escalate',
    taskType: 'strategy',
    systemPrompt: CAMPAIGN_LEAD_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'strategist',
    name: 'Strategist',
    role: 'Picks legend + community + plan',
    taskType: 'strategy',
    systemPrompt: STRATEGIST_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'content-writer',
    name: 'Content Writer',
    role: 'Drafts the post in the chosen legend\u2019s voice',
    taskType: 'content_writing',
    systemPrompt: WRITER_DYNAMIC_DESCRIPTION,
    dynamic: true,
  },
  {
    agentId: 'quality-gate',
    name: 'Quality Gate',
    role: 'LLM review + multi-axis scoring',
    taskType: 'classification',
    systemPrompt: QUALITY_GATE_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'safety-worker',
    name: 'Safety Worker',
    role: 'Rules-based account safety checks',
    taskType: null,
    systemPrompt: SAFETY_DESCRIPTION,
    dynamic: true,
  },
  {
    agentId: 'scout',
    name: 'Scout',
    role: 'Scans communities for dispatch candidates',
    taskType: 'classification',
    systemPrompt: SCOUT_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'analytics-analyst',
    name: 'Analytics Analyst',
    role: 'Distills insights from post metrics',
    taskType: 'classification',
    systemPrompt: ANALYTICS_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'memory-consolidator',
    name: 'Memory Consolidator',
    role: 'Distils shared craft lessons from episodes (daily cron)',
    taskType: 'classification',
    systemPrompt: MEMORY_CONSOLIDATOR_SYSTEM_PROMPT,
    dynamic: false,
  },
];

const KEBAB_TO_UUID: Record<string, string> = {
  'campaign-lead': SEED_AGENT_IDS.campaignLead,
  strategist: SEED_AGENT_IDS.strategist,
  'content-writer': SEED_AGENT_IDS.contentWriter,
  'quality-gate': SEED_AGENT_IDS.qualityGate,
  'safety-worker': SEED_AGENT_IDS.safetyWorker,
  scout: SEED_AGENT_IDS.scout,
  'analytics-analyst': SEED_AGENT_IDS.analyticsAnalyst,
  'memory-consolidator': SEED_AGENT_IDS.memoryConsolidator,
};

const soulPatchSchema = z.object({ soul: z.string().min(1).max(20_000) });

export async function registerAgentConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agents/config', { preHandler: [app.authenticate] }, async () => {
    const env = getEnv();
    const { activeProviders } = createDefaultRouter({ env });

    // Merge code defaults with any operator overrides from the DB.
    const db = getDb();
    const rows = await db
      .select({ id: agents.id, soul: agents.soul })
      .from(agents);
    const soulByUuid = new Map(rows.map((r) => [r.id, r.soul]));

    const merged = AGENTS.map((a) => {
      const uuid = KEBAB_TO_UUID[a.agentId];
      const overridden = uuid ? soulByUuid.get(uuid) : undefined;
      const customSoul = overridden && overridden.trim().length > 0 ? overridden : null;
      return {
        ...a,
        systemPrompt: customSoul ?? a.systemPrompt,
        overridden: customSoul !== null,
      };
    });

    return {
      mode: env.LLM_DEFAULT_MODE,
      activeProviders,
      routes: DEFAULT_ROUTES,
      agents: merged,
    };
  });

  app.patch<{ Params: { agentId: string } }>(
    '/agents/:agentId/soul',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = soulPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      const uuid = KEBAB_TO_UUID[req.params.agentId] ?? req.params.agentId;
      const [updated] = await getDb()
        .update(agents)
        .set({ soul: parsed.data.soul, updatedAt: new Date() })
        .where(eq(agents.id, uuid))
        .returning({ id: agents.id });
      if (!updated) return reply.code(404).send({ error: 'NotFound', agentId: req.params.agentId });
      invalidateSoulCache(uuid);
      return { ok: true, agentId: req.params.agentId };
    },
  );

  // Manual trigger for the consolidator — useful for testing or kicking off
  // a run after editing the consolidator's soul. Fire-and-forget.
  app.post('/memory/consolidate', { preHandler: [app.authenticate] }, async (_req, reply) => {
    const q = new Queue<MemoryConsolidateJobData>(QUEUE_NAMES.memoryConsolidate, {
      connection: getRedis(),
    });
    await q.add(
      'memory-consolidate-manual',
      {},
      { removeOnComplete: true, removeOnFail: true },
    );
    await q.close();
    return reply.code(202).send({ enqueued: true });
  });
}
