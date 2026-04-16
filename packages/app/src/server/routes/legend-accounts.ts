import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import { LegendAccountService } from '../../legend-accounts/account.service.js';
import {
  IllegalWarmUpTransitionError,
  LegendAccountLegendNotFoundError,
  LegendAccountNotFoundError,
  LegendAccountValidationError,
} from '../../legend-accounts/errors.js';
import type { WarmUpPhase } from '../../legend-accounts/validation.js';

interface IdParam {
  id: string;
}

interface LegendIdParam {
  legendId: string;
}

interface WarmUpBody {
  toPhase: WarmUpPhase;
}

interface RecordPostBody {
  isProductMention?: boolean;
}

export async function registerLegendAccountRoutes(app: FastifyInstance): Promise<void> {
  const service = new LegendAccountService(getDb());

  app.post<{ Params: LegendIdParam; Body: Record<string, unknown> }>(
    '/legends/:legendId/accounts',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        const payload = { ...req.body, legendId: req.params.legendId };
        const row = await service.create(payload);
        return reply.code(201).send(row);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );

  app.get<{ Params: LegendIdParam }>(
    '/legends/:legendId/accounts',
    { preHandler: [app.authenticate] },
    async (req) => {
      return service.list({ legendId: req.params.legendId });
    },
  );

  app.get<{ Params: IdParam }>(
    '/accounts/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.get(req.params.id);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );

  app.patch<{ Params: IdParam }>(
    '/accounts/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.update(req.params.id, req.body);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );

  app.delete<{ Params: IdParam }>(
    '/accounts/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        await service.remove(req.params.id);
        return reply.code(204).send();
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );

  app.post<{ Params: IdParam; Body: WarmUpBody }>(
    '/accounts/:id/warm-up',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.advanceWarmUp(req.params.id, req.body.toPhase);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );

  app.post<{ Params: IdParam; Body: RecordPostBody }>(
    '/accounts/:id/posts',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.recordPost(req.params.id, req.body);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );
}

function mapError(
  reply: import('fastify').FastifyReply,
  err: unknown,
): import('fastify').FastifyReply {
  if (err instanceof LegendAccountValidationError) {
    return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
  }
  if (err instanceof LegendAccountLegendNotFoundError) {
    return reply.code(400).send({ error: 'LegendNotFound', legendId: err.legendId });
  }
  if (err instanceof LegendAccountNotFoundError) {
    return reply.code(404).send({ error: 'NotFound', id: err.id });
  }
  if (err instanceof IllegalWarmUpTransitionError) {
    return reply.code(409).send({ error: 'IllegalTransition', from: err.from, to: err.to });
  }
  reply.log.error({ err }, 'unhandled legend-account route error');
  return reply.code(500).send({ error: 'InternalServerError' });
}
