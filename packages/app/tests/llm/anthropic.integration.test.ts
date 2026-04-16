import { describe, expect, it } from 'vitest';
import { AnthropicProvider } from '../../src/llm/anthropic.js';

const apiKey = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!apiKey)('AnthropicProvider (integration)', () => {
  it('generates a short response against the real API', async () => {
    const provider = new AnthropicProvider({ apiKey: apiKey! });
    const response = await provider.generate('claude-haiku-4-5-20251001', {
      systemPrompt: 'Reply with exactly one word, no punctuation.',
      userPrompt: 'Say hello.',
      maxTokens: 50,
    });

    expect(response.content.trim().length).toBeGreaterThan(0);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.costMillicents).toBeGreaterThan(0);
    expect(response.providerId).toBe('anthropic');
    expect(response.model).toBe('claude-haiku-4-5-20251001');
    expect(response.latencyMs).toBeGreaterThan(0);
  }, 30_000); // 30s timeout for real API call
});
