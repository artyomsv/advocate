import cors from '@fastify/cors';
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify';
import { registerAuthPlugin } from '../auth/index.js';
import { getEnv } from '../config/env.js';
import { logger } from '../config/logger.js';
import { closeDb } from '../db/connection.js';
import { createDefaultRouter } from '../llm/default-router.js';
import { closeRedis } from '../queue/connection.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerContentPlanRoutes } from './routes/content-plans.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerLegendAccountRoutes } from './routes/legend-accounts.js';
import { registerLegendRoutes } from './routes/legends.js';
import { registerLlmRoutes } from './routes/llm.js';
import { registerOrchestrateRoutes } from './routes/orchestrate.js';
import { registerProductRoutes } from './routes/products.js';
import { registerScheduleRoutes } from './routes/schedules.js';
import { registerSecretsRoutes } from './routes/secrets.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    // Fastify 5's FastifyBaseLogger adds `msgPrefix` which pino's Logger doesn't
    // expose. Runtime works fine; this cast reconciles the type layer only.
    loggerInstance: logger as unknown as FastifyBaseLogger,
    disableRequestLogging: false,
  });

  // Build the default LLM router once per server instance.
  const { router } = createDefaultRouter({ env: getEnv() });

  // Dashboard SPA lives on port 36400 (Docker) / 5173 (Vite dev).
  // mynah.cc is the production domain.
  await app.register(cors, {
    origin: [
      'http://localhost:36400',
      'http://localhost:5173',
      'https://mynah.cc',
      /\.mynah\.cc$/,
    ],
    credentials: true,
  });
  await registerAuthPlugin(app);
  await registerContentPlanRoutes(app);
  await registerHealthRoutes(app);
  await registerProductRoutes(app);
  await registerLegendRoutes(app);
  await registerLegendAccountRoutes(app);
  await registerAgentRoutes(app, { router, logger });
  await registerOrchestrateRoutes(app, { router, logger });
  await registerScheduleRoutes(app, { logger });
  await registerLlmRoutes(app);
  await registerSecretsRoutes(app);

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
