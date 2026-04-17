import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { SECRET_CATEGORIES, type SecretCategory } from '../../secrets/categories.js';
import { SecretsService } from '../../secrets/secrets.service.js';

const CATEGORY_VALUES = Object.keys(SECRET_CATEGORIES) as SecretCategory[];

const setBody = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

function isValidCategory(c: string): c is SecretCategory {
  return (CATEGORY_VALUES as string[]).includes(c);
}

export async function registerSecretsRoutes(app: FastifyInstance): Promise<void> {
  const service = new SecretsService(getDb());

  app.get<{ Params: { category: string } }>(
    '/secrets/:category',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!isValidCategory(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      return service.list(req.params.category);
    },
  );

  app.put<{ Params: { category: string } }>(
    '/secrets/:category',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!isValidCategory(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      const parsed = setBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      try {
        await service.set(req.params.category, parsed.data.key, parsed.data.value);
        return { ok: true };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Unknown secret key')) {
          return reply.code(400).send({ error: 'UnknownKey', message: err.message });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { category: string; key: string } }>(
    '/secrets/:category/:key',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!isValidCategory(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      await service.delete(req.params.category, req.params.key);
      return reply.code(204).send();
    },
  );
}
