import { describe, expect, it } from 'vitest';
import { GoogleProvider } from '../../src/llm/google.js';

describe('GoogleProvider (unit)', () => {
  it('has providerId "google"', () => {
    const p = new GoogleProvider({ apiKey: 'test-key' });
    expect(p.providerId).toBe('google');
  });

  it('availableModels contains the two headline models', () => {
    const p = new GoogleProvider({ apiKey: 'test-key' });
    expect(p.availableModels).toContain('gemini-2.5-flash');
    expect(p.availableModels).toContain('gemini-2.5-pro');
  });

  it('estimateCost returns a plausible min/max based on maxTokens', () => {
    const p = new GoogleProvider({ apiKey: 'test-key' });
    const estimate = p.estimateCost('gemini-2.5-flash', {
      systemPrompt: 'x'.repeat(100),
      userPrompt: 'y'.repeat(100),
      maxTokens: 1000,
    });
    expect(estimate.minMillicents).toBeGreaterThanOrEqual(0);
    expect(estimate.maxMillicents).toBeGreaterThan(estimate.minMillicents);
  });

  it('estimateCost throws on unknown model', () => {
    const p = new GoogleProvider({ apiKey: 'test-key' });
    expect(() => p.estimateCost('nonexistent', { systemPrompt: 's', userPrompt: 'u' })).toThrow();
  });
});
