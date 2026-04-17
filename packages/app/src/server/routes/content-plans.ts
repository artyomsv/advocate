import { Queue } from 'bullmq';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { ContentPlanService } from '../../content-plans/content-plan.service.js';
import {
  ContentPlanNotFoundError,
  IllegalStatusTransitionError,
} from '../../content-plans/errors.js';
import { getDb } from '../../db/connection.js';
import type { ContentPlan } from '../../db/schema.js';
import { getRedis } from '../../queue/connection.js';
import { type PostPublishJobData, QUEUE_NAMES } from '../../worker/queues.js';

const STATUSES = [
  'planned',
  'generating',
  'review',
  'approved',
  'rejected',
  'posted',
  'failed',
] as const;

const listQuery = z.object({
  status: z.enum(STATUSES).default('review'),
  legendId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
});

async function mapErrors(reply: FastifyReply, op: () => Promise<unknown>): Promise<unknown> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof ContentPlanNotFoundError) {
      return reply.code(404).send({ error: 'NotFound', id: err.id });
    }
    if (err instanceof IllegalStatusTransitionError) {
      return reply.code(409).send({
        error: 'IllegalStatusTransition',
        id: err.id,
        from: err.from,
        to: err.to,
      });
    }
    throw err;
  }
}

export async function registerContentPlanRoutes(app: FastifyInstance): Promise<void> {
  const service = new ContentPlanService(getDb());
  const postQueue = new Queue<PostPublishJobData>(QUEUE_NAMES.postPublish, {
    connection: getRedis(),
  });
  app.addHook('onClose', async () => {
    await postQueue.close();
  });

  app.get('/content-plans', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'ValidationError',
        issues: parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    const filter: { legendId?: string; productId?: string } = {};
    if (parsed.data.legendId) filter.legendId = parsed.data.legendId;
    if (parsed.data.productId) filter.productId = parsed.data.productId;
    return service.listByStatus(
      parsed.data.status as ContentPlan['status'],
      Object.keys(filter).length > 0 ? filter : undefined,
    );
  });

  app.get<{ Params: { id: string } }>(
    '/content-plans/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => mapErrors(reply, () => service.get(req.params.id)),
  );

  app.post<{ Params: { id: string } }>(
    '/content-plans/:id/approve',
    { preHandler: [app.authenticate] },
    async (req, reply) =>
      mapErrors(reply, async () => {
        const plan = await service.approve(req.params.id);
        const delayMs = Math.max(0, new Date(plan.scheduledAt).getTime() - Date.now());
        await postQueue.add(
          'publish',
          { contentPlanId: plan.id },
          { delay: delayMs, removeOnComplete: 100, removeOnFail: 100 },
        );
        req.log.info(
          { contentPlanId: plan.id, delayMs },
          'enqueued post.publish after approve',
        );
        return plan;
      }),
  );

  app.post<{ Params: { id: string } }>(
    '/content-plans/:id/reject',
    { preHandler: [app.authenticate] },
    async (req, reply) => mapErrors(reply, () => service.reject(req.params.id)),
  );
}
