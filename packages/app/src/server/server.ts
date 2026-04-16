import Fastify from 'fastify';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeDb } from '../db/connection.js';
import { closeRedis } from '../queue/connection.js';
import { registerHealthRoutes } from './routes/health.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildServer(): Promise<any> {
  const app = Fastify({
    loggerInstance: logger,
    disableRequestLogging: false,
  });

  await registerHealthRoutes(app);

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

// When imported as the entry point, start the server.
const isEntry = import.meta.url === `file://${process.argv[1]}`;
if (isEntry) {
  void start();
}
