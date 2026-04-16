import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeDb } from '../db/connection.js';
import { closeRedis } from '../queue/connection.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProductRoutes } from './routes/products.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify 5's FastifyBaseLogger adds `msgPrefix` which pino's Logger doesn't
    // expose. Runtime works fine; this cast reconciles the type layer only.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
  });

  await registerHealthRoutes(app);
  await registerProductRoutes(app);

  app.addHook('onClose', async () => {
    await Promise.all([closeDb(), closeRedis()]);
  });

  return app;
}

export async function start(): Promise<void> {
  const env = getEnv();
  const app = await buildServer();

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err, 'failed to start server');
    process.exit(1);
  }
}

// When run directly (production: `node dist/server/server.js`) auto-start.
// When imported (dev via dev.ts, or tests via buildServer) this stays silent.
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start();
}
