import type { LLMRouter } from '@advocate/engine';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { OrchestratorService } from '../../orchestrator/orchestrator.service.js';
import {
  OrchestratorNoAccountError,
  OrchestratorNoCommunitiesError,
  OrchestratorNoLegendsError,
} from '../../orchestrator/types.js';

export interface OrchestrateRoutesDeps {
  router: LLMRouter;
  logger: pino.Logger;
}

const draftSchema = z.object({
  productId: z.string().uuid(),
  campaignGoal: z.string().min(1),
  legendIds: z.array(z.string().uuid()).optional(),
  communityIds: z.array(z.string().uuid()).optional(),
  threadContext: z.string().optional(),
});

export async function registerOrchestrateRoutes(
  app: FastifyInstance,
  deps: OrchestrateRoutesDeps,
): Promise<void> {
  const orchestrator = new OrchestratorService({
    router: deps.router,
    db: getDb(),
    logger: deps.logger,
  });

  app.post('/orchestrate/draft', async (req, reply) => {
    const parsed = draftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    try {
      const result = await orchestrator.draft(parsed.data);
      return reply.code(201).send(result);
    } catch (err) {
      if (
        err instanceof OrchestratorNoLegendsError ||
        err instanceof OrchestratorNoCommunitiesError ||
        err instanceof OrchestratorNoAccountError
      ) {
        return reply
          .code(422)
          .send({ error: 'UnprocessableEntity', message: (err as Error).message });
      }
      if (err instanceof Error && /Product.*not found/i.test(err.message)) {
        return reply.code(404).send({ error: 'NotFound', message: err.message });
      }
      req.log.error({ err }, 'orchestrator draft failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });
}
