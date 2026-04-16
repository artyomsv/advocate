import OpenAI from 'openai';
import type {
  CostEstimate,
  LLMProvider,
  LlmRequest,
  LlmResponse,
} from '@advocate/engine';
import { childLogger } from '../config/logger.js';
import { computeCostMillicents, getPricing } from './pricing.js';

const log = childLogger('llm.openai');

const MODELS = ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'] as const;

export interface OpenAIProviderOptions {
  apiKey: string;
  timeoutMs?: number;
}

export class OpenAIProvider implements LLMProvider {
  readonly providerId = 'openai';
  readonly availableModels: readonly string[] = MODELS;

  readonly #client: OpenAI;

  constructor(options: OpenAIProviderOptions) {
    this.#client = new OpenAI({
      apiKey: options.apiKey,
      timeout: options.timeoutMs ?? 60_000,
    });
  }

  async generate(model: string, request: LlmRequest): Promise<LlmResponse> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }

    const startedAt = Date.now();
    const completion = await this.#client.chat.completions.create({
      model,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      response_format:
        request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      messages: [
        { role: 'system', content: request.systemPrompt },
        { role: 'user', content: request.userPrompt },
      ],
    });
    const latencyMs = Date.now() - startedAt;

    const content = completion.choices[0]?.message.content ?? '';
    const usage = {
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      cachedTokens: completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    };

    const costMillicents = computeCostMillicents(this.providerId, model, usage);
    log.debug({ model, usage, costMillicents, latencyMs }, 'openai completion');

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
    const inputTokens = Math.ceil((request.systemPrompt.length + request.userPrompt.length) / 4);
    const maxOutputTokens = request.maxTokens ?? 2048;

    const inputCost = (inputTokens * pricing.inputMillicentsPer1k) / 1000;
    const minOutputCost = (10 * pricing.outputMillicentsPer1k) / 1000;
    const maxOutputCost = (maxOutputTokens * pricing.outputMillicentsPer1k) / 1000;

    return {
      minMillicents: Math.round(inputCost + minOutputCost),
      maxMillicents: Math.round(inputCost + maxOutputCost),
    };
  }
}
