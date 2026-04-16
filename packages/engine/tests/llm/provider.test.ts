import { beforeEach, describe, expect, it } from 'vitest';
import { StubLLMProvider } from '../../src/llm/provider.js';

describe('StubLLMProvider', () => {
  let provider: StubLLMProvider;

  beforeEach(() => {
    provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  });

  it('returns the configured stub for a matching (system, user) prompt', async () => {
    provider.setStub('sys', 'hello', {
      content: 'hi back',
      usage: { inputTokens: 5, outputTokens: 4 },
      costMillicents: 10,
      latencyMs: 42,
    });
    const r = await provider.generate('stub-1', {
      systemPrompt: 'sys',
      userPrompt: 'hello',
    });
    expect(r.content).toBe('hi back');
    expect(r.providerId).toBe('stub');
    expect(r.model).toBe('stub-1');
    expect(r.costMillicents).toBe(10);
  });

  it('throws on unknown prompts by default', async () => {
    await expect(
      provider.generate('stub-1', { systemPrompt: 'x', userPrompt: 'y' }),
    ).rejects.toThrow(/no stub/i);
  });

  it('returns the default stub when configured', async () => {
    provider.setDefaultStub({
      content: 'default',
      usage: { inputTokens: 1, outputTokens: 1 },
      costMillicents: 1,
      latencyMs: 1,
    });
    const r = await provider.generate('stub-1', {
      systemPrompt: 'unknown',
      userPrompt: 'also unknown',
    });
    expect(r.content).toBe('default');
  });

  it('throws the configured error when simulating a failure', async () => {
    provider.setFailure('sys', 'fail', new Error('provider exploded'));
    await expect(
      provider.generate('stub-1', { systemPrompt: 'sys', userPrompt: 'fail' }),
    ).rejects.toThrow(/exploded/);
  });

  it('availableModels contains the default model', () => {
    expect(provider.availableModels).toContain('stub-1');
  });

  it('estimateCost returns configured cost or default when not set', () => {
    expect(provider.estimateCost('stub-1', { systemPrompt: 's', userPrompt: 'u' })).toEqual({
      minMillicents: 0,
      maxMillicents: 0,
    });
    provider.setCostEstimate('stub-1', { minMillicents: 5, maxMillicents: 50 });
    expect(provider.estimateCost('stub-1', { systemPrompt: 's', userPrompt: 'u' })).toEqual({
      minMillicents: 5,
      maxMillicents: 50,
    });
  });

  it('rejects calls for models not in availableModels', async () => {
    await expect(
      provider.generate('nonexistent', { systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow(/unsupported model/i);
  });
});
