import { pingDb } from '../../db/connection.js';
import { pingRedis } from '../../queue/connection.js';

// biome-ignore lint/suspicious/noExplicitAny: Fastify type system incompatible with Pino logger
export async function registerHealthRoutes(app: any): Promise<void> {
  // biome-ignore lint/suspicious/noExplicitAny: Fastify request/reply types
  app.get('/health', async (_req: any, reply: any) => {
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
