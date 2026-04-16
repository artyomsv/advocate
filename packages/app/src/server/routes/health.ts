import type { FastifyInstance } from 'fastify';
import { pingDb } from '../../db/connection.js';
import { pingRedis } from '../../queue/connection.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
    const [dbOk, redisOk] = await Promise.all([
      pingDb().catch(() => false),
      pingRedis().catch(() => false),
    ]);

    const allOk = dbOk && redisOk;
    return reply.code(allOk ? 200 : 503).send({
      status: allOk ? 'ok' : 'degraded',
      checks: {
        database: dbOk,
        redis: redisOk,
      },
    });
  });
}
