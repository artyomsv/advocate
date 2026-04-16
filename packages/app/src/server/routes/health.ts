import { pingDb } from '../../db/connection.js';
import { pingRedis } from '../../queue/connection.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function registerHealthRoutes(app: any): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
