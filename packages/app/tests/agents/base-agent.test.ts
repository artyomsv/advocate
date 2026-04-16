import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@advocate/engine';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { BaseAgent } from '../../src/agents/base-agent.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDeps(): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: 'canned',
    usage: { inputTokens: 10, outputTokens: 5 },
    costMillicents: 100,
    latencyMs: 10,
  });

  return {
    router: new InMemoryLLMRouter({
      providers: [provider],
      tracker: new InMemoryBudgetTracker({ monthlyCapCents: 2000 }),
      config: {
        mode: 'primary',
        sensitiveTaskTypes: [],
        routes: {
          content_writing: {
            primary: { providerId: 'stub', model: 'stub-1' },
            fallback: { providerId: 'stub', model: 'stub-1' },
            budget: { providerId: 'stub', model: 'stub-1' },
          },
        },
      },
    }),
    db: {} as AgentDeps['db'], // unused for BaseAgent's own tests
    logger: pino({ level: 'silent' }),
  };
}

class TestAgent extends BaseAgent {
  readonly name = 'test-agent';
}

describe('BaseAgent', () => {
  it('stores deps and exposes router + logger', () => {
    const deps = makeDeps();
    const a = new TestAgent(deps);
    expect(a.deps.router).toBe(deps.router);
    expect(a.deps.logger).toBe(deps.logger);
    expect(a.name).toBe('test-agent');
  });

  it('callLlm delegates to router.generate and includes agent.name in task context', async () => {
    const deps = makeDeps();
    const agent = new TestAgent(deps);
    const result = await agent.callLlm({
      taskType: 'content_writing',
      systemPrompt: 'sys',
      userPrompt: 'user',
    });
    expect(result.content).toBe('canned');
    expect(result.providerId).toBe('stub');
    expect(result.costMillicents).toBe(100);
  });
});
