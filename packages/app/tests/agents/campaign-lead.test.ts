import { InMemoryBudgetTracker, InMemoryLLMRouter, StubLLMProvider } from '@mynah/engine';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { CampaignLead, CampaignLeadFormatError } from '../../src/agents/campaign-lead.js';
import type { AgentDeps } from '../../src/agents/types.js';

function makeDeps(stubContent: string): AgentDeps {
  const provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  provider.setDefaultStub({
    content: stubContent,
    usage: { inputTokens: 200, outputTokens: 50 },
    costMillicents: 15,
    latencyMs: 40,
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

const APPROVE = JSON.stringify({
  decision: 'post',
  reasoning: 'Quality is high, safety passes, promo level fits.',
});
const REVISE = JSON.stringify({
  decision: 'revise',
  reasoning: 'Draft is too formal for r/Plumbing.',
});
const REJECT = JSON.stringify({
  decision: 'reject',
  reasoning: 'Fundamentally violates never-do rules.',
});
const ESCALATE = JSON.stringify({
  decision: 'escalate',
  reasoning: 'Promotion level 7 requires human sign-off.',
});

const baseInput = {
  draftContent: 'sample draft',
  personaSummary: 'Dave, plumber, casual.',
  qualityScore: {
    authenticity: 9,
    value: 8,
    promotionalSmell: 3,
    personaConsistency: 9,
    communityFit: 9,
    comments: 'Looks good.',
  },
  safetyResult: { allowed: true },
  promotionLevel: 3,
  campaignGoal: 'Build trust in r/Plumbing',
};

describe('CampaignLead', () => {
  it('post decision for good quality + passing safety', async () => {
    const lead = new CampaignLead(makeDeps(APPROVE));
    const r = await lead.decideOnContent(baseInput);
    expect(r.decision.decision).toBe('post');
  });

  it('revise decision when quality is borderline', async () => {
    const lead = new CampaignLead(makeDeps(REVISE));
    const r = await lead.decideOnContent({
      ...baseInput,
      qualityScore: { ...baseInput.qualityScore, authenticity: 6 },
    });
    expect(r.decision.decision).toBe('revise');
  });

  it('reject decision when draft violates rules', async () => {
    const lead = new CampaignLead(makeDeps(REJECT));
    const r = await lead.decideOnContent(baseInput);
    expect(r.decision.decision).toBe('reject');
  });

  it('escalate decision is always allowed', async () => {
    const lead = new CampaignLead(makeDeps(ESCALATE));
    const r = await lead.decideOnContent({ ...baseInput, promotionLevel: 7 });
    expect(r.decision.decision).toBe('escalate');
  });

  it('forces reject when safety blocked (does not call LLM)', async () => {
    const lead = new CampaignLead(makeDeps('should never be read'));
    const r = await lead.decideOnContent({
      ...baseInput,
      safetyResult: { allowed: false, reason: 'Daily cap reached' },
    });
    expect(r.decision.decision).toBe('reject');
    expect(r.decision.reasoning).toContain('Daily cap reached');
    // LLM was not invoked — costMillicents = 0
    expect(r.llm).toBeNull();
  });

  it('throws CampaignLeadFormatError on malformed JSON', async () => {
    const lead = new CampaignLead(makeDeps('not json'));
    await expect(lead.decideOnContent(baseInput)).rejects.toBeInstanceOf(CampaignLeadFormatError);
  });

  it('throws when decision field is not one of the 4 values', async () => {
    const bad = JSON.stringify({ decision: 'yolo', reasoning: 'x' });
    const lead = new CampaignLead(makeDeps(bad));
    await expect(lead.decideOnContent(baseInput)).rejects.toBeInstanceOf(CampaignLeadFormatError);
  });

  it('strips markdown code fences', async () => {
    const fenced = `\`\`\`json\n${APPROVE}\n\`\`\``;
    const lead = new CampaignLead(makeDeps(fenced));
    const r = await lead.decideOnContent(baseInput);
    expect(r.decision.decision).toBe('post');
  });

  it('returns LLM metadata when LLM was called', async () => {
    const lead = new CampaignLead(makeDeps(APPROVE));
    const r = await lead.decideOnContent(baseInput);
    expect(r.llm?.providerId).toBe('stub');
    expect(r.llm?.costMillicents).toBe(15);
  });
});
