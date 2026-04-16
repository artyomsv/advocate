import type { FastifyInstance, FastifyReply } from 'fastify';
import { getDb } from '../../db/connection.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../products/errors.js';
import { ProductService } from '../../products/product.service.js';

interface IdParam {
  id: string;
}

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductService(getDb());

  app.post('/products', async (req, reply) => {
    try {
      const product = await service.create(req.body);
      return reply.code(201).send(product);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get('/products', async () => {
    return service.list();
  });

  app.get<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      return await service.get(req.params.id);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.patch<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      return await service.update(req.params.id, req.body);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.delete<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      await service.remove(req.params.id);
      return reply.code(204).send();
    } catch (err) {
      return mapError(reply, err);
    }
  });
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
