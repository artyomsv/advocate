import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import {
  agentMessages,
  communities,
  consolidatedMemories,
  discoveries,
  episodicMemories,
  insights,
  legendAccounts,
  legends,
  postMetricsHistory,
  posts,
  relationalMemories,
  safetyEvents,
} from '../../db/schema.js';
import { SEED_AGENT_IDS } from '../../bootstrap/seed-agents.js';

const communitiesQuery = z.object({
  platform: z.string().optional(),
  status: z.enum(['discovered', 'approved', 'active', 'paused', 'blacklisted']).optional(),
});

const insightsQuery = z.object({
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const discoveriesQuery = z.object({
  productId: z.string().uuid().optional(),
  communityId: z.string().uuid().optional(),
  minScore: z.coerce.number().min(0).max(10).optional(),
  dispatched: z.enum(['true', 'false']).optional(),
  sinceDays: z.coerce.number().int().positive().max(365).optional(),
  limit: z.coerce.number().int().positive().max(500).default(200),
});

const postsQuery = z.object({
  legendId: z.string().uuid().optional(),
  communityId: z.string().uuid().optional(),
  removed: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export async function registerVisibilityRoutes(app: FastifyInstance): Promise<void> {
  const db = getDb();

  // ---- Communities ------------------------------------------------------

  app.get('/communities', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = communitiesQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const { platform, status } = parsed.data;
    const conds = [];
    if (platform) conds.push(eq(communities.platform, platform));
    if (status) conds.push(eq(communities.status, status));
    const q = db.select().from(communities);
    const rows = conds.length
      ? await q.where(and(...conds)).orderBy(desc(communities.relevanceScore))
      : await q.orderBy(desc(communities.relevanceScore));
    return rows;
  });

  app.get<{ Params: { id: string } }>(
    '/communities/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const [row] = await db
        .select()
        .from(communities)
        .where(eq(communities.id, req.params.id))
        .limit(1);
      if (!row) return reply.code(404).send({ error: 'NotFound' });
      return row;
    },
  );

  const communityPatchSchema = z.object({
    status: z.enum(['discovered', 'approved', 'active', 'paused', 'blacklisted']).optional(),
    defaultFlairId: z.string().max(200).nullable().optional(),
    defaultFlairText: z.string().max(200).nullable().optional(),
    notes: z.string().nullable().optional(),
  });

  app.patch<{ Params: { id: string } }>(
    '/communities/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = communityPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      const [row] = await db
        .update(communities)
        .set(parsed.data)
        .where(eq(communities.id, req.params.id))
        .returning();
      if (!row) return reply.code(404).send({ error: 'NotFound' });
      return row;
    },
  );

  // ---- Insights ---------------------------------------------------------

  app.get('/insights', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = insightsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const q = db.select().from(insights);
    const rows = parsed.data.productId
      ? await q
          .where(eq(insights.productId, parsed.data.productId))
          .orderBy(desc(insights.generatedAt))
          .limit(parsed.data.limit)
      : await q.orderBy(desc(insights.generatedAt)).limit(parsed.data.limit);
    return rows;
  });

  // ---- Discoveries ------------------------------------------------------

  app.get('/discoveries', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = discoveriesQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const { productId, communityId, minScore, dispatched, sinceDays, limit } = parsed.data;
    const conds = [];
    if (productId) conds.push(eq(discoveries.productId, productId));
    if (communityId) conds.push(eq(discoveries.communityId, communityId));
    if (typeof minScore === 'number') {
      conds.push(sql`${discoveries.score} >= ${minScore}`);
    }
    if (dispatched) conds.push(eq(discoveries.dispatched, dispatched === 'true'));
    if (sinceDays) {
      const since = new Date(Date.now() - sinceDays * 24 * 3600 * 1000);
      conds.push(gte(discoveries.scannedAt, since));
    }
    const q = db.select().from(discoveries);
    const rows = conds.length
      ? await q
          .where(and(...conds))
          .orderBy(desc(discoveries.scannedAt))
          .limit(limit)
      : await q.orderBy(desc(discoveries.scannedAt)).limit(limit);
    return rows;
  });

  app.get('/discoveries/histogram', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = z
      .object({
        productId: z.string().uuid().optional(),
        sinceDays: z.coerce.number().int().positive().max(365).default(30),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const since = new Date(Date.now() - parsed.data.sinceDays * 24 * 3600 * 1000);
    const conds = [gte(discoveries.scannedAt, since)];
    if (parsed.data.productId) conds.push(eq(discoveries.productId, parsed.data.productId));

    const rows = await db
      .select({
        bucket: sql<number>`FLOOR(${discoveries.score})::int`,
        total: sql<number>`COUNT(*)::int`,
        dispatched: sql<number>`COUNT(*) FILTER (WHERE ${discoveries.dispatched})::int`,
      })
      .from(discoveries)
      .where(and(...conds))
      .groupBy(sql`FLOOR(${discoveries.score})`)
      .orderBy(sql`FLOOR(${discoveries.score})`);

    return rows;
  });

  // ---- Posts ------------------------------------------------------------

  app.get('/posts', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = postsQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }

    // legendId filter joins posts -> legendAccounts -> legends
    if (parsed.data.legendId) {
      const rows = await db
        .select({ post: posts })
        .from(posts)
        .innerJoin(legendAccounts, eq(posts.legendAccountId, legendAccounts.id))
        .innerJoin(legends, eq(legendAccounts.legendId, legends.id))
        .where(eq(legends.id, parsed.data.legendId))
        .orderBy(desc(posts.postedAt))
        .limit(parsed.data.limit);
      return rows.map((r) => r.post);
    }

    const conds = [];
    if (parsed.data.communityId) conds.push(eq(posts.communityId, parsed.data.communityId));
    if (parsed.data.removed)
      conds.push(eq(posts.wasRemoved, parsed.data.removed === 'true'));

    const q = db.select().from(posts);
    const rows = conds.length
      ? await q
          .where(and(...conds))
          .orderBy(desc(posts.postedAt))
          .limit(parsed.data.limit)
      : await q.orderBy(desc(posts.postedAt)).limit(parsed.data.limit);
    return rows;
  });

  app.get<{ Params: { id: string } }>(
    '/posts/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const [row] = await db.select().from(posts).where(eq(posts.id, req.params.id)).limit(1);
      if (!row) return reply.code(404).send({ error: 'NotFound' });
      return row;
    },
  );

  app.get<{ Params: { id: string } }>(
    '/posts/:id/metrics',
    { preHandler: [app.authenticate] },
    async (req) => {
      const rows = await db
        .select()
        .from(postMetricsHistory)
        .where(eq(postMetricsHistory.postId, req.params.id))
        .orderBy(postMetricsHistory.measuredAt);
      return rows;
    },
  );

  // ---- Safety events ----------------------------------------------------

  const safetyQuery = z.object({
    eventType: z
      .enum([
        'rate_limit_hit',
        'content_rejected',
        'account_warned',
        'account_suspended',
        'kill_switch_activated',
      ])
      .optional(),
    sinceDays: z.coerce.number().int().positive().max(365).optional(),
    limit: z.coerce.number().int().positive().max(500).default(100),
  });

  // ---- Agent memories --------------------------------------------------

  const kebabToUuid: Record<string, string> = {
    'campaign-lead': SEED_AGENT_IDS.campaignLead,
    strategist: SEED_AGENT_IDS.strategist,
    'content-writer': SEED_AGENT_IDS.contentWriter,
    'quality-gate': SEED_AGENT_IDS.qualityGate,
    'safety-worker': SEED_AGENT_IDS.safetyWorker,
    scout: SEED_AGENT_IDS.scout,
    'analytics-analyst': SEED_AGENT_IDS.analyticsAnalyst,
  };

  app.get<{ Params: { agentId: string } }>(
    '/agents/:agentId/memories',
    { preHandler: [app.authenticate] },
    async (req) => {
      const uuid = kebabToUuid[req.params.agentId] ?? req.params.agentId;
      const [episodic, consolidated, relational] = await Promise.all([
        db
          .select()
          .from(episodicMemories)
          .where(eq(episodicMemories.agentId, uuid))
          .orderBy(desc(episodicMemories.createdAt))
          .limit(50),
        db
          .select()
          .from(consolidatedMemories)
          .where(eq(consolidatedMemories.agentId, uuid))
          .orderBy(desc(consolidatedMemories.consolidatedAt))
          .limit(20),
        db
          .select()
          .from(relationalMemories)
          .where(eq(relationalMemories.agentId, uuid))
          .orderBy(desc(relationalMemories.lastInteractionAt))
          .limit(50),
      ]);
      return { episodic, consolidated, relational };
    },
  );

  // ---- Agent messages --------------------------------------------------

  const messagesQuery = z.object({
    fromAgent: z.string().optional(),
    toAgent: z.string().optional(),
    taskId: z.string().uuid().optional(),
    sinceDays: z.coerce.number().int().positive().max(30).default(7),
    limit: z.coerce.number().int().positive().max(500).default(200),
  });

  app.get('/messages', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = messagesQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const { fromAgent, toAgent, taskId, sinceDays, limit } = parsed.data;
    const conds = [
      gte(agentMessages.createdAt, new Date(Date.now() - sinceDays * 24 * 3600 * 1000)),
    ];
    if (fromAgent) {
      const uuid = kebabToUuid[fromAgent] ?? fromAgent;
      conds.push(eq(agentMessages.fromAgent, uuid));
    }
    if (toAgent) {
      const uuid = kebabToUuid[toAgent] ?? toAgent;
      conds.push(eq(agentMessages.toAgent, uuid));
    }
    if (taskId) conds.push(eq(agentMessages.taskId, taskId));
    const rows = await db
      .select()
      .from(agentMessages)
      .where(and(...conds))
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit);
    return rows;
  });

  app.get('/safety-events', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = safetyQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const conds = [];
    if (parsed.data.eventType) conds.push(eq(safetyEvents.eventType, parsed.data.eventType));
    if (parsed.data.sinceDays) {
      const since = new Date(Date.now() - parsed.data.sinceDays * 24 * 3600 * 1000);
      conds.push(gte(safetyEvents.createdAt, since));
    }
    const q = db.select().from(safetyEvents);
    const rows = conds.length
      ? await q.where(and(...conds)).orderBy(desc(safetyEvents.createdAt)).limit(parsed.data.limit)
      : await q.orderBy(desc(safetyEvents.createdAt)).limit(parsed.data.limit);
    return rows;
  });
}
