import { describe, expect, it } from 'vitest';
import { OpenAIProvider } from '../../src/llm/openai.js';

const apiKey = process.env.OPENAI_API_KEY;

describe.skipIf(!apiKey)('OpenAIProvider (integration)', () => {
  it('generates a short response against the real API', async () => {
    const provider = new OpenAIProvider({ apiKey: apiKey! });
    const response = await provider.generate('gpt-4.1-nano', {
      systemPrompt: 'Reply with exactly one word, no punctuation.',
      userPrompt: 'Say hello.',
      maxTokens: 50,
    });

    expect(response.content.trim().length).toBeGreaterThan(0);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.costMillicents).toBeGreaterThan(0);
    expect(response.providerId).toBe('openai');
    expect(response.model).toBe('gpt-4.1-nano');
    expect(response.latencyMs).toBeGreaterThan(0);
  }, 30_000); // 30s timeout for real API call
});
