import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../../src/llm/anthropic.js';

describe('AnthropicProvider (unit)', () => {
  it('has providerId "anthropic"', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    expect(p.providerId).toBe('anthropic');
  });

  it('availableModels contains the three headline models', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    expect(p.availableModels).toContain('claude-sonnet-4-6');
    expect(p.availableModels).toContain('claude-haiku-4-5-20251001');
    expect(p.availableModels).toContain('claude-opus-4-6');
  });

  it('estimateCost returns a plausible min/max based on maxTokens', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    const estimate = p.estimateCost('claude-sonnet-4-6', {
      systemPrompt: 'x'.repeat(100),
      userPrompt: 'y'.repeat(100),
      maxTokens: 1000,
    });
    expect(estimate.minMillicents).toBeGreaterThanOrEqual(0);
    expect(estimate.maxMillicents).toBeGreaterThan(estimate.minMillicents);
  });

  it('estimateCost throws on unknown model', () => {
    const p = new AnthropicProvider({ apiKey: 'test-key' });
    expect(() => p.estimateCost('nonexistent', { systemPrompt: 's', userPrompt: 'u' })).toThrow();
  });
});
