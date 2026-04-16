import { describe, expect, it } from 'vitest';
import { createDefaultRouter } from '../../src/llm/default-router.js';

describe('createDefaultRouter', () => {
  it('returns a usable LLMRouter with budget mode default when no keys present', () => {
    const result = createDefaultRouter({
      env: {
        LLM_MONTHLY_BUDGET_CENTS: 2000,
        LLM_DEFAULT_MODE: 'balanced',
      },
    });
    expect(result.router).toBeDefined();
    expect(result.router.getMode()).toBe('balanced');
    // When no keys are present, router.providers is 1 (the stub)
    expect(result.activeProviders).toHaveLength(1);
    expect(result.activeProviders[0]).toBe('stub');
  });

  it('registers one provider per API key present', () => {
    const result = createDefaultRouter({
      env: {
        ANTHROPIC_API_KEY: 'a',
        GOOGLE_AI_API_KEY: 'g',
        OPENAI_API_KEY: 'o',
        LLM_MONTHLY_BUDGET_CENTS: 2000,
        LLM_DEFAULT_MODE: 'primary',
      },
    });
    expect(result.activeProviders).toEqual(
      expect.arrayContaining(['anthropic', 'google', 'openai']),
    );
    expect(result.router.getMode()).toBe('primary');
  });

  it('passes mode through from env', () => {
    const result = createDefaultRouter({
      env: {
        LLM_MONTHLY_BUDGET_CENTS: 2000,
        LLM_DEFAULT_MODE: 'budget',
      },
    });
    expect(result.router.getMode()).toBe('budget');
  });

  it('router config includes the standard task types', () => {
    const result = createDefaultRouter({
      env: {
        LLM_MONTHLY_BUDGET_CENTS: 2000,
        LLM_DEFAULT_MODE: 'balanced',
      },
    });
    // Check each of the 4 routing buckets exists
    expect(result.routeKeys).toEqual(
      expect.arrayContaining(['content_writing', 'strategy', 'classification', 'bulk']),
    );
  });
});
