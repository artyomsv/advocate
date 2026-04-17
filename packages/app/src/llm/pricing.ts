import type { LlmTokenUsage } from '@mynah/engine';

/**
 * Per-model pricing. Rates are millicents per 1,000 tokens.
 * (1 millicent = 1/100,000 USD, so 100 millicents = 1 cent = $0.01.)
 *
 * Sources — public pricing pages as of April 2026; update when providers change.
 * Note: some providers offer context-cached rates significantly lower than regular
 * input; those appear as `cachedMillicentsPer1k` and are used when the response
 * reports non-zero cached tokens.
 */
export interface ModelPricing {
  inputMillicentsPer1k: number;
  outputMillicentsPer1k: number;
  cachedMillicentsPer1k?: number;
}

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Anthropic — "claude-*" models, cached rate ~10% of input
  'anthropic:claude-opus-4-6': {
    inputMillicentsPer1k: 1500,
    outputMillicentsPer1k: 7500,
    cachedMillicentsPer1k: 150,
  },
  'anthropic:claude-sonnet-4-6': {
    inputMillicentsPer1k: 300,
    outputMillicentsPer1k: 1500,
    cachedMillicentsPer1k: 30,
  },
  'anthropic:claude-haiku-4-5-20251001': {
    inputMillicentsPer1k: 80,
    outputMillicentsPer1k: 400,
    cachedMillicentsPer1k: 8,
  },

  // Google — Gemini
  'google:gemini-2.5-pro': {
    inputMillicentsPer1k: 125,
    outputMillicentsPer1k: 1000,
  },
  'google:gemini-2.5-flash': {
    inputMillicentsPer1k: 15,
    outputMillicentsPer1k: 60,
  },

  // OpenAI — GPT-4.1 family
  'openai:gpt-4.1': {
    inputMillicentsPer1k: 200,
    outputMillicentsPer1k: 800,
  },
  'openai:gpt-4.1-mini': {
    inputMillicentsPer1k: 40,
    outputMillicentsPer1k: 160,
  },
  'openai:gpt-4.1-nano': {
    inputMillicentsPer1k: 10,
    outputMillicentsPer1k: 40,
  },
};

export function getPricing(providerId: string, model: string): ModelPricing {
  const key = `${providerId}:${model}`;
  const pricing = MODEL_PRICING[key];
  if (!pricing) {
    throw new Error(`No pricing for ${key}`);
  }
  return pricing;
}

export function computeCostMillicents(
  providerId: string,
  model: string,
  usage: LlmTokenUsage,
): number {
  const pricing = getPricing(providerId, model);
  const inputCost = (usage.inputTokens * pricing.inputMillicentsPer1k) / 1000;
  const outputCost = (usage.outputTokens * pricing.outputMillicentsPer1k) / 1000;
  const cachedRate = pricing.cachedMillicentsPer1k ?? pricing.inputMillicentsPer1k;
  const cachedCost = ((usage.cachedTokens ?? 0) * cachedRate) / 1000;
  return Math.round(inputCost + outputCost + cachedCost);
}
