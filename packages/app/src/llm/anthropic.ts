import type { CostEstimate, LLMProvider, LlmRequest, LlmResponse } from '@advocate/engine';
import Anthropic from '@anthropic-ai/sdk';
import { childLogger } from '../config/logger.js';
import { computeCostMillicents, getPricing } from './pricing.js';

const log = childLogger('llm.anthropic');

const MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'] as const;

export interface AnthropicProviderOptions {
  apiKey: string;
  timeoutMs?: number;
}

export class AnthropicProvider implements LLMProvider {
  readonly providerId = 'anthropic';
  readonly availableModels: readonly string[] = MODELS;

  readonly #client: Anthropic;

  constructor(options: AnthropicProviderOptions) {
    this.#client = new Anthropic({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 60_000,
    });
  }

  async generate(model: string, request: LlmRequest): Promise<LlmResponse> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }

    const startedAt = Date.now();
    const completion = await this.#client.messages.create({
      model,
      max_tokens: request.maxTokens ?? 2048,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });
    const latencyMs = Date.now() - startedAt;

    const content = completion.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    const usage = {
      inputTokens: completion.usage.input_tokens,
      outputTokens: completion.usage.output_tokens,
      cachedTokens: completion.usage.cache_read_input_tokens ?? 0,
    };

    const costMillicents = computeCostMillicents(this.providerId, model, usage);

    log.debug({ model, usage, costMillicents, latencyMs }, 'anthropic completion');

    return {
      content,
      usage,
      costMillicents,
      providerId: this.providerId,
      model,
      latencyMs,
    };
  }

  estimateCost(model: string, request: LlmRequest): CostEstimate {
    const pricing = getPricing(this.providerId, model);
    // Rough estimate: assume 4 chars per token for inputs, maxTokens for output.
    const inputTokens = Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4);
    const maxOutputTokens = request.maxTokens ?? 2048;

    const inputCost = (inputTokens * pricing.inputMillicentsPer1k) / 1000;
    const minOutputCost = (10 * pricing.outputMillicentsPer1k) / 1000; // minimum usable output
    const maxOutputCost = (maxOutputTokens * pricing.outputMillicentsPer1k) / 1000;

    return {
      minMillicents: Math.round(inputCost + minOutputCost),
      maxMillicents: Math.round(inputCost + maxOutputCost),
    };
  }
}
