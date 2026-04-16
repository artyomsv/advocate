import { isoNow } from '../types/common.js';
import type { BudgetTracker } from './budget.js';
import type { LLMProvider } from './provider.js';
import type { BudgetStatus, LlmRequest, LlmResponse, LlmUsageRecord } from './types.js';

export type RouterMode = 'primary' | 'balanced' | 'budget';

export interface ModelChoice {
  providerId: string;
  model: string;
}

export interface ModelRoute {
  primary: ModelChoice;
  fallback: ModelChoice;
  budget: ModelChoice;
}

export interface RouterConfig {
  mode: RouterMode;
  routes: Record<string, ModelRoute>;
  sensitiveTaskTypes: readonly string[];
}

export interface GenerateOptions {
  /** Force sensitive handling even if the task type isn't in `sensitiveTaskTypes`. */
  sensitive?: boolean;
}

export interface LLMRouter {
  generate(taskType: string, request: LlmRequest, options?: GenerateOptions): Promise<LlmResponse>;
  setMode(mode: RouterMode): void;
  getMode(): RouterMode;
  getBudgetStatus(): Promise<BudgetStatus>;
}

export interface LLMRouterOptions {
  providers: readonly LLMProvider[];
  tracker: BudgetTracker;
  config: RouterConfig;
}

export class InMemoryLLMRouter implements LLMRouter {
  readonly #providersById = new Map<string, LLMProvider>();
  readonly #tracker: BudgetTracker;
  #config: RouterConfig;

  constructor(options: LLMRouterOptions) {
    for (const provider of options.providers) {
      this.#providersById.set(provider.providerId, provider);
    }
    this.#tracker = options.tracker;
    this.#config = { ...options.config };
  }

  setMode(mode: RouterMode): void {
    this.#config = { ...this.#config, mode };
  }

  getMode(): RouterMode {
    return this.#config.mode;
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    return this.#tracker.getStatus();
  }

  async generate(
    taskType: string,
    request: LlmRequest,
    options: GenerateOptions = {},
  ): Promise<LlmResponse> {
    const route = this.#config.routes[taskType];
    if (!route) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    const sensitive = options.sensitive || this.#config.sensitiveTaskTypes.includes(taskType);
    const tiers = this.#resolveTiers(route, sensitive);

    let lastError: unknown;
    for (const tier of tiers) {
      const provider = this.#providersById.get(tier.providerId);
      if (!provider) {
        lastError = new Error(`Provider not registered: ${tier.providerId}`);
        continue;
      }
      try {
        const response = await provider.generate(tier.model, request);
        const record: LlmUsageRecord = {
          providerId: response.providerId,
          model: response.model,
          taskType,
          usage: response.usage,
          costMillicents: response.costMillicents,
          latencyMs: response.latencyMs,
          occurredAt: isoNow(),
        };
        await this.#tracker.record(record);
        return response;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `All ${tiers.length} tiers failed for task type "${taskType}": ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  #resolveTiers(route: ModelRoute, sensitive: boolean): ModelChoice[] {
    // Primary mode: primary → fallback → budget
    // Balanced mode: primary → fallback → budget (same fallback chain; the
    //   difference is that balanced is tolerant of failing over quickly).
    // Budget mode: budget → fallback → primary (flipped priority).
    // Sensitive: budget tier is ALWAYS removed from the chain.
    const ordered: ModelChoice[] = [];
    if (this.#config.mode === 'budget' && !sensitive) {
      ordered.push(route.budget, route.fallback, route.primary);
    } else {
      ordered.push(route.primary, route.fallback);
      if (!sensitive) ordered.push(route.budget);
    }
    return ordered;
  }
}
