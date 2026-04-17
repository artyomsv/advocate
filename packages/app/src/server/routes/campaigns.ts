import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { CampaignNotFoundError, CampaignService } from '../../campaigns/campaign.service.js';
import { getDb } from '../../db/connection.js';

const listQuery = z.object({
  productId: z.string().uuid().optional(),
});

interface IdParam {
  id: string;
}

function mapError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof CampaignNotFoundError) {
    return reply.code(404).send({ error: 'NotFound', message: err.message });
  }
  if (err instanceof z.ZodError) {
    return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
  }
  reply.request.log.error({ err }, 'campaign route error');
  return reply.code(500).send({ error: 'InternalServerError' });
}

export async function registerCampaignRoutes(app: FastifyInstance): Promise<void> {
  const service = new CampaignService(getDb());

  app.post('/campaigns', { preHandler: [app.authenticate] }, async (req, reply) => {
    try {
      const created = await service.create(req.body);
      return reply.code(201).send(created);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get('/campaigns', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    return service.listWithStats(parsed.data.productId);
  });

  app.get<{ Params: IdParam }>(
    '/campaigns/:id',
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
    '/campaigns/:id',
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
    '/campaigns/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const removed = await service.remove(req.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'NotFound', message: 'Campaign not found' });
      }
      return reply.code(204).send();
    },
  );
}
