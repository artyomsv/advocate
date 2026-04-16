import { describe, expect, it } from 'vitest';
import { computeCostMillicents, getPricing, MODEL_PRICING } from '../../src/llm/pricing.js';

describe('MODEL_PRICING', () => {
  it('includes the three headline models', () => {
    expect(MODEL_PRICING['anthropic:claude-sonnet-4-6']).toBeDefined();
    expect(MODEL_PRICING['google:gemini-2.5-flash']).toBeDefined();
    expect(MODEL_PRICING['openai:gpt-4.1-mini']).toBeDefined();
  });

  it('all entries have positive input + output rates in millicents per 1k tokens', () => {
    for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing.inputMillicentsPer1k, key).toBeGreaterThan(0);
      expect(pricing.outputMillicentsPer1k, key).toBeGreaterThan(0);
    }
  });
});

describe('getPricing', () => {
  it('returns the entry for a known key', () => {
    const pricing = getPricing('anthropic', 'claude-sonnet-4-6');
    expect(pricing.inputMillicentsPer1k).toBeGreaterThan(0);
  });

  it('throws for an unknown provider:model', () => {
    expect(() => getPricing('unknown', 'model')).toThrow(/no pricing/i);
  });
});

describe('computeCostMillicents', () => {
  it('sums input + output at the pricing rates', () => {
    const cost = computeCostMillicents('anthropic', 'claude-haiku-4-5-20251001', {
      inputTokens: 1000,
      outputTokens: 500,
    });
    // Haiku 4.5: $0.80 input, $4.00 output per 1M → 80 millicents / 1k input, 400 / 1k output
    // 1000 * 80/1000 + 500 * 400/1000 = 80 + 200 = 280 millicents
    expect(cost).toBe(280);
  });

  it('uses cached rate when cachedTokens provided', () => {
    // Anthropic cached input is ~10% of regular input (simplifying assumption)
    // For claude-sonnet-4-6: 300 millicents/1k input, 30 millicents/1k cached
    const cost = computeCostMillicents('anthropic', 'claude-sonnet-4-6', {
      inputTokens: 1000, // 300
      outputTokens: 500, // 750 (sonnet output is 1500/1k)
      cachedTokens: 2000, // 60 (2 * 30)
    });
    // 300 + 750 + 60 = 1110
    expect(cost).toBe(1110);
  });

  it('rounds to integer millicents (no fractional)', () => {
    const cost = computeCostMillicents('google', 'gemini-2.5-flash', {
      inputTokens: 1,
      outputTokens: 1,
    });
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBeGreaterThanOrEqual(0);
  });
});
