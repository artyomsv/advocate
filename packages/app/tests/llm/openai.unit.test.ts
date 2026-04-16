import { describe, expect, it } from 'vitest';
import { OpenAIProvider } from '../../src/llm/openai.js';

describe('OpenAIProvider (unit)', () => {
  it('has providerId "openai"', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' });
    expect(p.providerId).toBe('openai');
  });

  it('availableModels contains the three headline models', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' });
    expect(p.availableModels).toContain('gpt-4.1');
    expect(p.availableModels).toContain('gpt-4.1-mini');
    expect(p.availableModels).toContain('gpt-4.1-nano');
  });

  it('estimateCost returns a plausible min/max based on maxTokens', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' });
    const estimate = p.estimateCost('gpt-4.1-mini', {
      systemPrompt: 'x'.repeat(100),
      userPrompt: 'y'.repeat(100),
      maxTokens: 1000,
    });
    expect(estimate.minMillicents).toBeGreaterThanOrEqual(0);
    expect(estimate.maxMillicents).toBeGreaterThan(estimate.minMillicents);
  });

  it('estimateCost throws on unknown model', () => {
    const p = new OpenAIProvider({ apiKey: 'test-key' });
    expect(() => p.estimateCost('nonexistent', { systemPrompt: 's', userPrompt: 'u' })).toThrow();
  });
});
