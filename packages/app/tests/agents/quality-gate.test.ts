import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@advocate/engine';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { QualityGate, QualityGateFormatError } from '../../src/agents/quality-gate.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDepsWithStub(stubContent: string): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: stubContent,
    usage: { inputTokens: 150, outputTokens: 40 },
    costMillicents: 5,
    latencyMs: 20,
  });
  return {
    router: new InMemoryLLMRouter({
      providers: [provider],
      tracker: new InMemoryBudgetTracker({ monthlyCapCents: 2000 }),
      config: {
        mode: 'primary',
        sensitiveTaskTypes: [],
        routes: {
          classification: {
            primary: { providerId: 'stub', model: 'stub-1' },
            fallback: { providerId: 'stub', model: 'stub-1' },
            budget: { providerId: 'stub', model: 'stub-1' },
          },
        },
      },
    }),
    // db is unused by QualityGate itself — it doesn't fetch rows.
    db: {} as AgentDeps['db'],
    logger: pino({ level: 'silent' }),
  };
}

const VALID_LLM_OUTPUT = JSON.stringify({
  authenticity: 9,
  value: 8,
  promotionalSmell: 2,
  personaConsistency: 9,
  communityFit: 8,
  comments: 'Reads natural; Dave-specific voice cues landed.',
});

describe('QualityGate', () => {
  it('parses a valid LLM response and returns approved=true', async () => {
    const gate = new QualityGate(makeDepsWithStub(VALID_LLM_OUTPUT));
    const result = await gate.review({
      draftContent: 'some draft',
      personaSummary: 'Dave, plumber, casual tone.',
      communityRules: 'No self-promotion.',
      promotionLevel: 3,
    });
    expect(result.approved).toBe(true);
    expect(result.score.authenticity).toBe(9);
    expect(result.score.promotionalSmell).toBe(2);
    expect(result.comments).toContain('Dave-specific');
  });

  it('approved=false when promotionalSmell > 4 at low promotion level', async () => {
    const rejecty = JSON.stringify({
      authenticity: 9,
      value: 8,
      promotionalSmell: 6,
      personaConsistency: 9,
      communityFit: 8,
      comments: 'Too promotional.',
    });
    const gate = new QualityGate(makeDepsWithStub(rejecty));
    const result = await gate.review({
      draftContent: 'shill post',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 1,
    });
    expect(result.approved).toBe(false);
  });

  it('approved=false when authenticity < 6', async () => {
    const low = JSON.stringify({
      authenticity: 4,
      value: 8,
      promotionalSmell: 1,
      personaConsistency: 7,
      communityFit: 7,
      comments: 'Sounds robotic.',
    });
    const gate = new QualityGate(makeDepsWithStub(low));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(false);
  });

  it('approved=false when value < 5', async () => {
    const low = JSON.stringify({
      authenticity: 8,
      value: 3,
      promotionalSmell: 2,
      personaConsistency: 7,
      communityFit: 7,
      comments: 'No useful content.',
    });
    const gate = new QualityGate(makeDepsWithStub(low));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(false);
  });

  it('allows high promotionalSmell at high promotion level', async () => {
    const output = JSON.stringify({
      authenticity: 9,
      value: 8,
      promotionalSmell: 6,
      personaConsistency: 8,
      communityFit: 8,
      comments: 'Product mention is central; appropriate for level 7.',
    });
    const gate = new QualityGate(makeDepsWithStub(output));
    const result = await gate.review({
      draftContent: 'product pitch',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 7,
    });
    expect(result.approved).toBe(true);
  });

  it('throws QualityGateFormatError on malformed LLM JSON', async () => {
    const gate = new QualityGate(makeDepsWithStub('not json at all'));
    await expect(
      gate.review({
        draftContent: 'x',
        personaSummary: 'Dave',
        communityRules: '',
        promotionLevel: 0,
      }),
    ).rejects.toBeInstanceOf(QualityGateFormatError);
  });

  it('throws QualityGateFormatError when required fields are missing', async () => {
    const bad = JSON.stringify({ authenticity: 9, value: 8 }); // missing 3 fields
    const gate = new QualityGate(makeDepsWithStub(bad));
    await expect(
      gate.review({
        draftContent: 'x',
        personaSummary: 'Dave',
        communityRules: '',
        promotionLevel: 0,
      }),
    ).rejects.toBeInstanceOf(QualityGateFormatError);
  });

  it('strips leading/trailing markdown code fences from LLM output', async () => {
    const fenced = `\`\`\`json\n${VALID_LLM_OUTPUT}\n\`\`\``;
    const gate = new QualityGate(makeDepsWithStub(fenced));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.approved).toBe(true);
  });

  it('reports raw LLM response in result for debugging', async () => {
    const gate = new QualityGate(makeDepsWithStub(VALID_LLM_OUTPUT));
    const result = await gate.review({
      draftContent: 'x',
      personaSummary: 'Dave',
      communityRules: '',
      promotionLevel: 0,
    });
    expect(result.llm.providerId).toBe('stub');
    expect(result.llm.costMillicents).toBe(5);
  });
});
