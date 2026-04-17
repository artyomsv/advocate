import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import {
  communities,
  insights,
  legendAccounts,
  legends,
  postMetricsHistory,
  posts,
} from '../../db/schema.js';

const communitiesQuery = z.object({
  platform: z.string().optional(),
  status: z.enum(['discovered', 'approved', 'active', 'paused', 'blacklisted']).optional(),
});

const insightsQuery = z.object({
  productId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
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
}
