import type { FastifyInstance } from 'fastify';
import { getEnv } from '../../config/env.js';
import { createDefaultRouter } from '../../llm/default-router.js';

export interface LlmStatus {
  mode: string;
  monthlyBudgetCents: number;
  activeProviders: readonly string[];
  routes: readonly string[];
}

export async function registerLlmRoutes(app: FastifyInstance): Promise<void> {
  app.get('/llm/status', { preHandler: [app.authenticate] }, async (): Promise<LlmStatus> => {
    const env = getEnv();
    const { activeProviders, routeKeys } = createDefaultRouter({ env });
    return {
      mode: env.LLM_DEFAULT_MODE,
      monthlyBudgetCents: env.LLM_MONTHLY_BUDGET_CENTS,
      activeProviders,
      routes: routeKeys,
    };
  });
}
