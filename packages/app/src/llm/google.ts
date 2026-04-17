import { GoogleGenerativeAI } from '@google/generative-ai';
import type { CostEstimate, LLMProvider, LlmRequest, LlmResponse } from '@mynah/engine';
import { childLogger } from '../config/logger.js';
import { computeCostMillicents, getPricing } from './pricing.js';

const log = childLogger('llm.google');

const MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash'] as const;

export interface GoogleProviderOptions {
  apiKey: string;
}

export class GoogleProvider implements LLMProvider {
  readonly providerId = 'google';
  readonly availableModels: readonly string[] = MODELS;

  readonly #client: GoogleGenerativeAI;

  constructor(options: GoogleProviderOptions) {
    this.#client = new GoogleGenerativeAI(options.apiKey);
  }

  async generate(model: string, request: LlmRequest): Promise<LlmResponse> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }

    const startedAt = Date.now();
    // Gemini 2.5 Pro REQUIRES thinking mode (budget 0 rejected with 400).
    // Gemini 2.5 Flash has thinking mode available but optional; disabling it
    // is safe and avoids empty responses on JSON-output calls with modest
    // maxTokens (Flash's default thinkingBudget can eat all user-facing tokens).
    // SDK type defs on older versions may omit thinkingConfig; cast to pass it.
    const generationConfig = {
      temperature: request.temperature,
      maxOutputTokens: request.maxTokens,
      responseMimeType: request.responseFormat === 'json' ? 'application/json' : 'text/plain',
      ...(model === 'gemini-2.5-flash' ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    } as Parameters<GoogleGenerativeAI['getGenerativeModel']>[0]['generationConfig'];

    const genModel = this.#client.getGenerativeModel({
      model,
      systemInstruction: request.systemPrompt,
      generationConfig,
    });

    const result = await genModel.generateContent(request.userPrompt);
    const latencyMs = Date.now() - startedAt;

    const content = result.response.text();
    const metadata = result.response.usageMetadata;
    const usage = {
      inputTokens: metadata?.promptTokenCount ?? 0,
      outputTokens: metadata?.candidatesTokenCount ?? 0,
      cachedTokens: metadata?.cachedContentTokenCount ?? 0,
    };

    const costMillicents = computeCostMillicents(this.providerId, model, usage);
    log.debug({ model, usage, costMillicents, latencyMs }, 'google completion');

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
