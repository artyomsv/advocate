import type { AgentId } from '@mynah/engine';
import type { FastifyInstance } from 'fastify';
import type pino from 'pino';
import { z } from 'zod';
import { BullMQHeartbeatScheduler } from '../../heartbeat/bullmq-scheduler.js';
import { getRedis } from '../../queue/connection.js';
import { QUEUE_NAMES } from '../../worker/queues.js';

export interface ScheduleRoutesDeps {
  logger: pino.Logger;
}

const registerSchema = z.object({
  name: z.string().min(1),
  cronPattern: z.string().min(1),
  productId: z.string().uuid(),
  campaignGoal: z.string().min(1),
  legendIds: z.array(z.string().uuid()).optional(),
  communityIds: z.array(z.string().uuid()).optional(),
  threadContext: z.string().optional(),
  agentId: z.string().uuid().default('00000000-0000-4000-8000-000000000001'),
});

export async function registerScheduleRoutes(
  app: FastifyInstance,
  _deps: ScheduleRoutesDeps,
): Promise<void> {
  const scheduler = new BullMQHeartbeatScheduler(getRedis());

  app.addHook('onClose', async () => {
    await scheduler.close();
  });

  app.post('/schedules/orchestrate', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
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
      const schedule = await scheduler.registerCron({
        agentId: parsed.data.agentId as AgentId,
        name: parsed.data.name,
        queueName: QUEUE_NAMES.orchestrate,
        cronPattern: parsed.data.cronPattern,
        jobType: 'orchestrate.draft',
        jobData: {
          productId: parsed.data.productId,
          campaignGoal: parsed.data.campaignGoal,
          legendIds: parsed.data.legendIds,
          communityIds: parsed.data.communityIds,
          threadContext: parsed.data.threadContext,
        },
      });
      return reply.code(201).send(schedule);
    } catch (err) {
      req.log.error({ err }, 'schedule register failed');
      return reply.code(500).send({ error: 'InternalServerError' });
    }
  });

  app.get('/schedules/orchestrate', { preHandler: [app.authenticate] }, async () => {
    return scheduler.listSchedules(QUEUE_NAMES.orchestrate);
  });

  app.delete<{ Params: { id: string } }>(
    '/schedules/orchestrate/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const removed = await scheduler.unregisterCron(QUEUE_NAMES.orchestrate, req.params.id);
      if (!removed) {
        return reply.code(404).send({ error: 'NotFound', id: req.params.id });
      }
      return reply.code(204).send();
    },
  );
}
