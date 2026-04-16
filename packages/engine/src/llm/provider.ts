import type { CostEstimate, LlmRequest, LlmResponse } from './types.js';

/**
 * Provider contract. Implementations wrap an SDK (Anthropic, Google, OpenAI,
 * DeepSeek, Qwen) and translate `LlmRequest` → provider call → `LlmResponse`.
 *
 * Providers MUST handle their own retry/backoff for transient errors and
 * throw on non-recoverable errors; the router treats any thrown error as a
 * signal to fall back to the next tier.
 */
export interface LLMProvider {
  readonly providerId: string;
  readonly availableModels: readonly string[];

  generate(model: string, request: LlmRequest): Promise<LlmResponse>;

  /** Pre-dispatch cost estimate used by the router for budget checks. */
  estimateCost(model: string, request: LlmRequest): CostEstimate;
}

/**
 * Deterministic test provider. Configure stubs keyed by (systemPrompt, userPrompt)
 * pairs; set a default stub or a default failure for unknown prompts.
 */
export interface StubLLMProviderOptions {
  providerId: string;
  defaultModel: string;
  extraModels?: readonly string[];
}

type StubBody = Omit<LlmResponse, 'providerId' | 'model'>;

export class StubLLMProvider implements LLMProvider {
  readonly providerId: string;
  readonly availableModels: readonly string[];

  #stubs = new Map<string, StubBody>();
  #failures = new Map<string, Error>();
  #costs = new Map<string, CostEstimate>();
  #defaultStub?: StubBody;

  constructor(options: StubLLMProviderOptions) {
    this.providerId = options.providerId;
    this.availableModels = [options.defaultModel, ...(options.extraModels ?? [])];
  }

  setStub(systemPrompt: string, userPrompt: string, body: StubBody): void {
    this.#stubs.set(this.#key(systemPrompt, userPrompt), body);
  }

  setDefaultStub(body: StubBody): void {
    this.#defaultStub = body;
  }

  setFailure(systemPrompt: string, userPrompt: string, error: Error): void {
    this.#failures.set(this.#key(systemPrompt, userPrompt), error);
  }

  setCostEstimate(model: string, estimate: CostEstimate): void {
    this.#costs.set(model, estimate);
  }

  async generate(model: string, request: LlmRequest): Promise<LlmResponse> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }
    const key = this.#key(request.systemPrompt, request.userPrompt);
    const failure = this.#failures.get(key);
    if (failure) throw failure;
    const body = this.#stubs.get(key) ?? this.#defaultStub;
    if (!body) {
      throw new Error(
        `No stub configured for (systemPrompt, userPrompt) — call setStub or setDefaultStub`,
      );
    }
    return { ...body, providerId: this.providerId, model };
  }

  estimateCost(model: string, _request: LlmRequest): CostEstimate {
    return this.#costs.get(model) ?? { minMillicents: 0, maxMillicents: 0 };
  }

  #key(systemPrompt: string, userPrompt: string): string {
    return `${systemPrompt}\u0000${userPrompt}`;
  }
}
