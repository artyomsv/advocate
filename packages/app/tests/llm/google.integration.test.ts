import { describe, expect, it } from 'vitest';
import { GoogleProvider } from '../../src/llm/google.js';

const apiKey = process.env.GOOGLE_AI_API_KEY;

describe.skipIf(!apiKey)('GoogleProvider (integration)', () => {
  it('generates a short response against the real API', async () => {
    const provider = new GoogleProvider({ apiKey: apiKey! });
    const response = await provider.generate('gemini-2.5-flash', {
      systemPrompt: 'Reply with exactly one word, no punctuation.',
      userPrompt: 'Say hello.',
      maxTokens: 50,
    });

    expect(response.content.trim().length).toBeGreaterThan(0);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.costMillicents).toBeGreaterThan(0);
    expect(response.providerId).toBe('google');
    expect(response.model).toBe('gemini-2.5-flash');
    expect(response.latencyMs).toBeGreaterThan(0);
  }, 30_000); // 30s timeout for real API call
});
