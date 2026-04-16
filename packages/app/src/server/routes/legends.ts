import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDb } from '../../db/connection.js';
import {
  LegendNotFoundError,
  LegendProductNotFoundError,
  LegendValidationError,
} from '../../legends/errors.js';
import { LegendService } from '../../legends/legend.service.js';

interface IdParam {
  id: string;
}

interface ProductIdParam {
  productId: string;
}

export async function registerLegendRoutes(app: FastifyInstance): Promise<void> {
  const service = new LegendService(getDb());

  app.post('/legends', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const legend = await service.create(req.body);
      return reply.code(201).send(legend);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get('/legends', { preHandler: [app.authenticate] }, async () => {
    return service.list();
  });

  app.get<{ Params: IdParam }>(
    '/legends/:id',
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
    '/legends/:id',
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
    '/legends/:id',
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

  app.get<{ Params: ProductIdParam }>(
    '/products/:productId/legends',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.listForProduct(req.params.productId);
      } catch (err) {
        return mapError(reply, err);
      }
    },
  );
}

/**
 * Map domain errors to HTTP status codes. This stays local to the route file
 * rather than in a global error handler so the mapping is obvious at the call
 * site and testable without Fastify instance boilerplate.
 */
function mapError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof LegendValidationError) {
    return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
  }
  if (err instanceof LegendProductNotFoundError) {
    return reply.code(400).send({ error: 'ProductNotFound', productId: err.productId });
  }
  if (err instanceof LegendNotFoundError) {
    return reply.code(404).send({ error: 'NotFound', id: err.id });
  }
  reply.log.error({ err }, 'unhandled legend route error');
  return reply.code(500).send({ error: 'InternalServerError' });
}
