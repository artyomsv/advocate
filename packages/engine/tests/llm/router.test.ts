import { describe, expect, it } from 'vitest';
import { InMemoryBudgetTracker } from '../../src/llm/budget.js';
import { StubLLMProvider } from '../../src/llm/provider.js';
import { InMemoryLLMRouter, type RouterConfig } from '../../src/llm/router.js';

function makeRouter(overrides: Partial<RouterConfig> = {}) {
  const primary = new StubLLMProvider({ providerId: 'primary', defaultModel: 'primary-1' });
  const fallback = new StubLLMProvider({ providerId: 'fallback', defaultModel: 'fallback-1' });
  const budget = new StubLLMProvider({ providerId: 'budget', defaultModel: 'budget-1' });

  const stubBody = {
    usage: { inputTokens: 1, outputTokens: 1 },
    costMillicents: 1000,
    latencyMs: 10,
  };
  primary.setDefaultStub({ ...stubBody, content: 'from-primary' });
  fallback.setDefaultStub({ ...stubBody, content: 'from-fallback' });
  budget.setDefaultStub({ ...stubBody, content: 'from-budget' });

  const tracker = new InMemoryBudgetTracker({ monthlyCapCents: 10_000 });

  const config: RouterConfig = {
    mode: 'primary',
    sensitiveTaskTypes: ['strategy_planning'],
    routes: {
      content_writing: {
        primary: { providerId: 'primary', model: 'primary-1' },
        fallback: { providerId: 'fallback', model: 'fallback-1' },
        budget: { providerId: 'budget', model: 'budget-1' },
      },
      strategy_planning: {
        primary: { providerId: 'primary', model: 'primary-1' },
        fallback: { providerId: 'fallback', model: 'fallback-1' },
        budget: { providerId: 'budget', model: 'budget-1' },
      },
    },
    ...overrides,
  };

  const router = new InMemoryLLMRouter({
    providers: [primary, fallback, budget],
    tracker,
    config,
  });

  return { router, tracker, primary, fallback, budget };
}

describe('InMemoryLLMRouter', () => {
  describe('mode routing', () => {
    it('primary mode uses the primary provider', async () => {
      const { router } = makeRouter();
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.content).toBe('from-primary');
      expect(r.providerId).toBe('primary');
    });

    it('budget mode uses the budget provider', async () => {
      const { router } = makeRouter({ mode: 'budget' });
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.content).toBe('from-budget');
    });

    it('balanced mode uses primary when healthy', async () => {
      const { router } = makeRouter({ mode: 'balanced' });
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('primary');
    });
  });

  describe('fallback chain', () => {
    it('falls back from primary to fallback on primary error', async () => {
      const { router, primary } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('fallback');
    });

    it('falls back further to budget on both primary and fallback failure', async () => {
      const { router, primary, fallback } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      fallback.setFailure('s', 'u', new Error('fallback down'));
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('budget');
    });

    it('throws when all three tiers fail', async () => {
      const { router, primary, fallback, budget } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('p'));
      fallback.setFailure('s', 'u', new Error('f'));
      budget.setFailure('s', 'u', new Error('b'));
      await expect(
        router.generate('content_writing', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow(/all.*tiers/i);
    });
  });

  describe('sensitivity', () => {
    it('blocks budget tier for sensitive task types even in budget mode', async () => {
      const { router } = makeRouter({ mode: 'budget' });
      // strategy_planning is in sensitiveTaskTypes
      const r = await router.generate('strategy_planning', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('primary');
    });

    it('when sensitive + primary fails, falls to fallback NOT budget', async () => {
      const { router, primary } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      const r = await router.generate('strategy_planning', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('fallback');
    });

    it('sensitive + primary+fallback fail → throws (no budget escape hatch)', async () => {
      const { router, primary, fallback } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('p'));
      fallback.setFailure('s', 'u', new Error('f'));
      await expect(
        router.generate('strategy_planning', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow();
    });
  });

  describe('budget gating', () => {
    it('records every successful call via the tracker', async () => {
      const { router, tracker } = makeRouter();
      await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      const status = await tracker.getStatus();
      // 1000 millicents = 1¢, rounded up
      expect(status.spentCents).toBe(1);
    });

    it('unknown task type throws a clear error', async () => {
      const { router } = makeRouter();
      await expect(
        router.generate('not_a_task', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow(/unknown task type/i);
    });
  });

  describe('mode accessors', () => {
    it('setMode updates the active mode', () => {
      const { router } = makeRouter();
      expect(router.getMode()).toBe('primary');
      router.setMode('budget');
      expect(router.getMode()).toBe('budget');
    });
  });
});
