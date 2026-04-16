import type { LLMRouter } from '@advocate/engine';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import { createContentWriter } from '../../agents/factory.js';
import { getDb } from '../../db/connection.js';

const draftRequestSchema = z.object({
  legendId: z.string().uuid(),
  productId: z.string().uuid().optional(),
  communityId: z.string().uuid().optional(),
  task: z.object({
    type: z.string().min(1),
    promotionLevel: z.number().int().min(0).max(10),
    instructions: z.string().min(1),
  }),
  platform: z.object({ id: z.string(), name: z.string() }).optional(),
  community: z
    .object({
      id: z.string(),
      name: z.string(),
      platform: z.string(),
      rulesSummary: z.string().optional(),
      cultureSummary: z.string().optional(),
    })
    .optional(),
  thread: z.object({ url: z.string().optional(), summary: z.string() }).optional(),
  relevantMemories: z.array(z.string()).optional(),
  recentActivity: z.array(z.string()).optional(),
});

export interface AgentRoutesDeps {
  router: LLMRouter;
  logger: pino.Logger;
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  deps: AgentRoutesDeps,
): Promise<void> {
  const writer = createContentWriter({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  app.post('/agents/content-writer/draft', async (req, reply) => {
    const parsed = draftRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    try {
      const result = await writer.generateDraft(parsed.data);
      return result;
    } catch (err) {
      if (err instanceof Error && /not found/i.test(err.message)) {
        return reply.code(404).send({ error: 'NotFound', message: err.message });
      }
      req.log.error({ err }, 'content writer draft failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });
}
