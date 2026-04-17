import {
  type BudgetTracker,
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  type LLMProvider,
  type LLMRouter,
  type ModelChoice,
  type ModelRoute,
  type RouterConfig,
  type RouterMode,
  StubLLMProvider,
} from '@mynah/engine';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { DrizzleBudgetTracker } from '../engine-stores/budget/drizzle-budget-tracker.js';
import { AnthropicProvider } from './anthropic.js';
import { GoogleProvider } from './google.js';
import { OpenAIProvider } from './openai.js';

/**
 * Env subset needed by the factory. Declared inline so this module doesn't
 * couple to config/env.ts — callers pass whichever env shape they have.
 */
export interface DefaultRouterEnv {
  ANTHROPIC_API_KEY?: string;
  GOOGLE_AI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  DEEPSEEK_API_KEY?: string;
  QWEN_API_KEY?: string;
  LLM_MONTHLY_BUDGET_CENTS: number;
  LLM_DEFAULT_MODE: RouterMode;
}

export interface CreateDefaultRouterOptions {
  env: DefaultRouterEnv;
  /**
   * Optional Drizzle DB handle. When provided, every LLM call is persisted
   * to the llm_usage table (powers agent-stats + monthly budget aggregation).
   * When absent, falls back to the in-memory tracker — useful for unit tests
   * and for callers that only need route metadata (e.g. /llm/status).
   */
  db?: NodePgDatabase<typeof schema>;
}

export interface CreateDefaultRouterResult {
  router: LLMRouter;
  activeProviders: readonly string[];
  routeKeys: readonly string[];
}

/**
 * Routing defaults per task type. Uses Claude for creative + strategic work,
 * Gemini Flash for cheap bulk + classification. When a real provider isn't
 * available we fall through to the stub; all route choices still resolve.
 */
const DEFAULT_ROUTES: Record<string, ModelRoute> = {
  content_writing: {
    primary: choice('anthropic', 'claude-sonnet-4-6'),
    fallback: choice('openai', 'gpt-4.1'),
    budget: choice('google', 'gemini-2.5-flash'),
  },
  strategy: {
    // Claude Sonnet is the preferred strategic reasoner. Gemini Flash is a
    // reasonable fallback because it returns structured JSON reliably without
    // consuming output tokens on internal thinking (Gemini Pro requires
    // thinking mode, which tends to eat modest maxTokens budgets).
    primary: choice('anthropic', 'claude-sonnet-4-6'),
    fallback: choice('google', 'gemini-2.5-flash'),
    budget: choice('openai', 'gpt-4.1-mini'),
  },
  classification: {
    primary: choice('google', 'gemini-2.5-flash'),
    fallback: choice('openai', 'gpt-4.1-mini'),
    budget: choice('google', 'gemini-2.5-flash'),
  },
  bulk: {
    primary: choice('google', 'gemini-2.5-flash'),
    fallback: choice('openai', 'gpt-4.1-nano'),
    budget: choice('google', 'gemini-2.5-flash'),
  },
};

const SENSITIVE_TASK_TYPES = ['strategy', 'credential_handling', 'inter_agent_communication'];

function choice(providerId: string, model: string): ModelChoice {
  return { providerId, model };
}

/**
 * Builds the default LLMRouter wiring in live providers for every API key
 * present in env. Missing providers leave their routing targets referencing
 * a provider that isn't registered — the router will fall back to the next
 * tier automatically. When ZERO keys are present we register a single
 * StubLLMProvider so the router still resolves for verification tests.
 */
export function createDefaultRouter(
  options: CreateDefaultRouterOptions,
): CreateDefaultRouterResult {
  const providers: LLMProvider[] = [];
  const activeProviders: string[] = [];

  if (options.env.ANTHROPIC_API_KEY) {
    providers.push(new AnthropicProvider({ apiKey: options.env.ANTHROPIC_API_KEY }));
    activeProviders.push('anthropic');
  }
  if (options.env.GOOGLE_AI_API_KEY) {
    providers.push(new GoogleProvider({ apiKey: options.env.GOOGLE_AI_API_KEY }));
    activeProviders.push('google');
  }
  if (options.env.OPENAI_API_KEY) {
    providers.push(new OpenAIProvider({ apiKey: options.env.OPENAI_API_KEY }));
    activeProviders.push('openai');
  }

  if (providers.length === 0) {
    // No live providers — fall back to a stub so startup + health checks work.
    const stub = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
    stub.setDefaultStub({
      content: 'stub response',
      usage: { inputTokens: 1, outputTokens: 1 },
      costMillicents: 0,
      latencyMs: 0,
    });
    providers.push(stub);
    activeProviders.push('stub');
  }

  const tracker: BudgetTracker = options.db
    ? new DrizzleBudgetTracker(options.db, {
        monthlyCapCents: options.env.LLM_MONTHLY_BUDGET_CENTS,
      })
    : new InMemoryBudgetTracker({
        monthlyCapCents: options.env.LLM_MONTHLY_BUDGET_CENTS,
      });

  // When the stub is the only provider, rewrite all routes to point at it
  // so the router has a resolvable target.
  const stubOnly = activeProviders.length === 1 && activeProviders[0] === 'stub';
  const routes: Record<string, ModelRoute> = stubOnly
    ? Object.fromEntries(
        Object.keys(DEFAULT_ROUTES).map((k) => [
          k,
          {
            primary: choice('stub', 'stub-1'),
            fallback: choice('stub', 'stub-1'),
            budget: choice('stub', 'stub-1'),
          },
        ]),
      )
    : DEFAULT_ROUTES;

  const config: RouterConfig = {
    mode: options.env.LLM_DEFAULT_MODE,
    routes,
    sensitiveTaskTypes: SENSITIVE_TASK_TYPES,
  };

  const router = new InMemoryLLMRouter({ providers, tracker, config });

  return {
    router,
    activeProviders,
    routeKeys: Object.keys(routes),
  };
}
