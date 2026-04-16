import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@advocate/engine';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { Strategist, StrategistFormatError } from '../../src/agents/strategist.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDepsWithStub(stubContent: string): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: stubContent,
    usage: { inputTokens: 300, outputTokens: 80 },
    costMillicents: 20,
    latencyMs: 30,
  });
  return {
    router: new InMemoryLLMRouter({
      providers: [provider],
      tracker: new InMemoryBudgetTracker({ monthlyCapCents: 2000 }),
      config: {
        mode: 'primary',
        sensitiveTaskTypes: ['strategy'],
        routes: {
          strategy: {
            primary: { providerId: 'stub', model: 'stub-1' },
            fallback: { providerId: 'stub', model: 'stub-1' },
            budget: { providerId: 'stub', model: 'stub-1' },
          },
        },
      },
    }),
    db: {} as AgentDeps['db'],
    logger: pino({ level: 'silent' }),
  };
}

const VALID_STUB_OUTPUT = JSON.stringify({
  legendId: '11111111-1111-4111-8111-111111111111',
  communityId: '22222222-2222-4222-8222-222222222222',
  contentType: 'helpful_comment',
  promotionLevel: 0,
  reasoning: 'Dave is warming up in r/Plumbing; pure-value comment builds karma.',
});

describe('Strategist', () => {
  it('parses valid LLM output and returns a structured plan', async () => {
    const s = new Strategist(makeDepsWithStub(VALID_STUB_OUTPUT));
    const result = await s.planContent({
      productName: 'Foreman',
      productOneLiner: 'AI phone answering for contractors',
      campaignGoal: 'Build trust in r/Plumbing',
      availableLegends: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          summary: 'Dave, plumber, low tech',
          maturity: 'lurking',
        },
      ],
      availableCommunities: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          platform: 'reddit',
          name: 'r/Plumbing',
          culture: 'blue-collar',
        },
      ],
    });

    expect(result.plan.legendId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.plan.communityId).toBe('22222222-2222-4222-8222-222222222222');
    expect(result.plan.contentType).toBe('helpful_comment');
    expect(result.plan.promotionLevel).toBe(0);
    expect(result.plan.reasoning).toContain('karma');
    expect(result.llm.providerId).toBe('stub');
  });

  it('throws StrategistFormatError on malformed JSON', async () => {
    const s = new Strategist(makeDepsWithStub('definitely not json'));
    await expect(
      s.planContent({
        productName: 'x',
        productOneLiner: 'x',
        campaignGoal: 'x',
        availableLegends: [
          { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r',
            culture: 'x',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(StrategistFormatError);
  });

  it('throws when returned legendId is not in the available set', async () => {
    const badLegend = JSON.stringify({
      legendId: '99999999-9999-4999-8999-999999999999',
      communityId: '22222222-2222-4222-8222-222222222222',
      contentType: 'helpful_comment',
      promotionLevel: 0,
      reasoning: 'x',
    });
    const s = new Strategist(makeDepsWithStub(badLegend));
    await expect(
      s.planContent({
        productName: 'x',
        productOneLiner: 'x',
        campaignGoal: 'x',
        availableLegends: [
          { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r',
            culture: 'x',
          },
        ],
      }),
    ).rejects.toThrow(/legendId.*not in the available set/i);
  });

  it('throws when returned communityId is not in the available set', async () => {
    const badComm = JSON.stringify({
      legendId: '11111111-1111-4111-8111-111111111111',
      communityId: '99999999-9999-4999-8999-999999999999',
      contentType: 'helpful_comment',
      promotionLevel: 0,
      reasoning: 'x',
    });
    const s = new Strategist(makeDepsWithStub(badComm));
    await expect(
      s.planContent({
        productName: 'x',
        productOneLiner: 'x',
        campaignGoal: 'x',
        availableLegends: [
          { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r',
            culture: 'x',
          },
        ],
      }),
    ).rejects.toThrow(/communityId.*not in the available set/i);
  });

  it('throws when contentType is not a recognized enum value', async () => {
    const badType = JSON.stringify({
      legendId: '11111111-1111-4111-8111-111111111111',
      communityId: '22222222-2222-4222-8222-222222222222',
      contentType: 'bogus_type',
      promotionLevel: 0,
      reasoning: 'x',
    });
    const s = new Strategist(makeDepsWithStub(badType));
    await expect(
      s.planContent({
        productName: 'x',
        productOneLiner: 'x',
        campaignGoal: 'x',
        availableLegends: [
          { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r',
            culture: 'x',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(StrategistFormatError);
  });

  it('throws when promotionLevel is out of range', async () => {
    const badPromo = JSON.stringify({
      legendId: '11111111-1111-4111-8111-111111111111',
      communityId: '22222222-2222-4222-8222-222222222222',
      contentType: 'helpful_comment',
      promotionLevel: 15,
      reasoning: 'x',
    });
    const s = new Strategist(makeDepsWithStub(badPromo));
    await expect(
      s.planContent({
        productName: 'x',
        productOneLiner: 'x',
        campaignGoal: 'x',
        availableLegends: [
          { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
        ],
        availableCommunities: [
          {
            id: '22222222-2222-4222-8222-222222222222',
            platform: 'reddit',
            name: 'r',
            culture: 'x',
          },
        ],
      }),
    ).rejects.toBeInstanceOf(StrategistFormatError);
  });

  it('strips markdown code fences from LLM output', async () => {
    const fenced = `\`\`\`json\n${VALID_STUB_OUTPUT}\n\`\`\``;
    const s = new Strategist(makeDepsWithStub(fenced));
    const result = await s.planContent({
      productName: 'x',
      productOneLiner: 'x',
      campaignGoal: 'x',
      availableLegends: [
        { id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' },
      ],
      availableCommunities: [
        { id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' },
      ],
    });
    expect(result.plan.contentType).toBe('helpful_comment');
  });
});
