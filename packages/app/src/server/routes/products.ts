import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../products/errors.js';
import { ProductService } from '../../products/product.service.js';
import { ProductStatsService } from '../../products/product.stats.service.js';

interface IdParam {
  id: string;
}

const activityQuery = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductService(getDb());
  const stats = new ProductStatsService(getDb());

  app.post('/products', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const product = await service.create(req.body);
      return reply.code(201).send(product);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get('/products', { preHandler: [app.authenticate] }, async () => {
    return service.list();
  });

  app.get<{ Params: IdParam }>(
    '/products/:id',
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
    '/products/:id',
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
    '/products/:id',
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

  app.get<{ Params: IdParam }>(
    '/products/:id/dashboard',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const dash = await stats.dashboard(req.params.id);
      if (!dash) return reply.code(404).send({ error: 'NotFound', id: req.params.id });
      return dash;
    },
  );

  app.get<{ Params: IdParam }>(
    '/products/:id/activity',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = activityQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      return stats.activity(req.params.id, parsed.data.limit);
    },
  );
}

/**
 * Map domain errors to HTTP status codes. This stays local to the route file
 * rather than in a global error handler so the mapping is obvious at the call
 * site and testable without Fastify instance boilerplate.
 */
function mapError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof ProductValidationError) {
    return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
  }
  if (err instanceof ProductNotFoundError) {
    return reply.code(404).send({ error: 'NotFound', id: err.id });
  }
  if (err instanceof DuplicateSlugError) {
    return reply.code(409).send({ error: 'Conflict', slug: err.slug });
  }
  reply.log.error({ err }, 'unhandled product route error');
  return reply.code(500).send({ error: 'InternalServerError' });
}
