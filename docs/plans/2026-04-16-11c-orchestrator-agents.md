# Orchestrator Agents Implementation Plan (Plan 11c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the two "thinking" agents that make decisions rather than produce output: **Strategist** (picks which legend + community + content type + promotion level for an upcoming task) and **CampaignLead** (final approver that decides `post` / `revise` / `reject` / `escalate` given a draft + quality score + safety result). Both are LLM-heavy (task type: `strategy`), return structured JSON, and expose HTTP endpoints for isolated testing.

**Architecture:** Same BaseAgent + JSON-mode LLM call pattern validated in Plan 11b. Standalone in this plan — neither agent calls other agents. Composing them into a pipeline (Strategist → ContentWriter → QualityGate → SafetyWorker → CampaignLead → post) is Plan 11d's job.

**Tech Stack:** Existing. JSON-mode LLM output (`responseFormat: 'json'`) confirmed working with Gemini in Plan 11b.

**Prerequisites:**
- Plan 11b complete (tag `plan11b-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/app/src/agents/
├── strategist.ts                   # Strategist — plan content assignment
└── campaign-lead.ts                # CampaignLead — approve/revise/reject/escalate

packages/app/src/server/routes/
└── agents.ts                       # (existing) — add /agents/strategist/plan + /agents/campaign-lead/decide

packages/app/tests/agents/
├── strategist.test.ts
├── strategist.http.test.ts
├── campaign-lead.test.ts
└── campaign-lead.http.test.ts
```

## Design decisions

1. **Strategist takes a snapshot, returns a decision.** Input: product brief, list of available legends (id + brief persona summary + warm-up phase), list of available communities (id + platform + culture summary), task hint (what's the general goal). Output: one recommendation with legend + community + content type + promotion level + reasoning.

2. **CampaignLead is the "would I ship this" decider.** Input: the draft, the quality gate score, the safety result, the campaign context. Output: a decision (`post` / `revise` / `reject` / `escalate`) with reasoning. `escalate` means "route this to human via Telegram" — the route can surface `escalate` as a 202 Accepted response so the dashboard knows to queue a notification.

3. **Both return strict JSON via `responseFormat: 'json'`.** Same pattern as Plan 11b's QualityGate — the error class maps to 502 at the HTTP layer.

4. **No persistence.** These agents are pure decision functions. Persisting strategy outputs (as `content_plans` rows) + campaign-lead decisions (as `agent_messages` + audit log) is Plan 11d when we wire the pipeline.

5. **Content type + promotion level are constrained.** Strategist must return one of the DB-enumerated values. Zod validates on the way out.

---

## Task 1: Strategist Agent

**Files:**
- Create: `packages/app/src/agents/strategist.ts`
- Create: `packages/app/tests/agents/strategist.test.ts`

- [ ] **Step 1.1: Write failing test FIRST**

Create `packages/app/tests/agents/strategist.test.ts`:

```typescript
import {
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  StubLLMProvider,
} from '@advocate/engine';
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
        { id: '11111111-1111-4111-8111-111111111111', summary: 'Dave, plumber, low tech', maturity: 'lurking' },
      ],
      availableCommunities: [
        { id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r/Plumbing', culture: 'blue-collar' },
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
        availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
        availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
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
        availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
        availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
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
        availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
        availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
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
        availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
        availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
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
        availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
        availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
      }),
    ).rejects.toBeInstanceOf(StrategistFormatError);
  });

  it('strips markdown code fences from LLM output', async () => {
    const fenced = '```json\n' + VALID_STUB_OUTPUT + '\n```';
    const s = new Strategist(makeDepsWithStub(fenced));
    const result = await s.planContent({
      productName: 'x',
      productOneLiner: 'x',
      campaignGoal: 'x',
      availableLegends: [{ id: '11111111-1111-4111-8111-111111111111', summary: 'x', maturity: 'lurking' }],
      availableCommunities: [{ id: '22222222-2222-4222-8222-222222222222', platform: 'reddit', name: 'r', culture: 'x' }],
    });
    expect(result.plan.contentType).toBe('helpful_comment');
  });
});
```

- [ ] **Step 1.2: Run — MUST FAIL**

```bash
pnpm --filter @advocate/app test strategist.test
```

- [ ] **Step 1.3: Implement `packages/app/src/agents/strategist.ts`**

```typescript
import { z } from 'zod';
import { BaseAgent } from './base-agent.js';

export class StrategistFormatError extends Error {
  constructor(public readonly rawResponse: string, cause?: unknown) {
    super(`Strategist LLM returned malformed output. First 200 chars: ${rawResponse.slice(0, 200)}`);
    this.name = 'StrategistFormatError';
    if (cause) this.cause = cause;
  }
}

/**
 * Brief summary of a legend as seen by the Strategist. The Strategist
 * doesn't need the full Legend record — just enough to pick between options.
 */
export interface LegendSummary {
  id: string;
  summary: string;
  maturity: 'lurking' | 'engaging' | 'established' | 'promoting';
}

export interface CommunitySummary {
  id: string;
  platform: string;
  name: string;
  culture?: string;
  rulesSummary?: string;
}

export interface PlanContentInput {
  productName: string;
  productOneLiner: string;
  campaignGoal: string;
  availableLegends: readonly LegendSummary[];
  availableCommunities: readonly CommunitySummary[];
  /** Optional: specific thread context that triggered this planning call. */
  threadContext?: string;
}

const CONTENT_TYPE_VALUES = [
  'helpful_comment',
  'value_post',
  'problem_question',
  'comparison_question',
  'experience_share',
  'recommendation',
  'launch_post',
] as const;

const planSchema = z.object({
  legendId: z.string().uuid(),
  communityId: z.string().uuid(),
  contentType: z.enum(CONTENT_TYPE_VALUES),
  promotionLevel: z.number().int().min(0).max(10),
  reasoning: z.string().min(1),
});

export type StrategistPlan = z.infer<typeof planSchema>;

export interface PlanContentResult {
  plan: StrategistPlan;
  llm: {
    providerId: string;
    model: string;
    costMillicents: number;
    latencyMs: number;
  };
}

const SYSTEM_PROMPT = `You are a strategist for an organic community promotion system. Your job is to choose the best legend + community + content type + promotion level for the next post. You MUST respond with ONLY a JSON object — no prose, no markdown.

Core principles:
- Warm-up legends (maturity: lurking, engaging) should post promotion level 0–2: pure value, no product mention.
- Established legends may post promotion level 3–5 occasionally.
- Only promoting-phase legends should post promotion level 6+.
- Match the legend's voice + expertise to the community's culture.

Content types:
- helpful_comment: reply to someone else's post with pure value
- value_post: original post sharing knowledge
- problem_question: ask the community about a pain point (seeds awareness)
- comparison_question: "what do you use for X?" — creates natural openings
- experience_share: "I tried X and here's what happened" — soft product mention
- recommendation: "I'd recommend X" — direct mention
- launch_post: product announcement (rare, only very mature legends)

Return JSON shape:
{
  "legendId": "<uuid from availableLegends>",
  "communityId": "<uuid from availableCommunities>",
  "contentType": "<one of the values above>",
  "promotionLevel": <integer 0-10>,
  "reasoning": "<1-2 sentences explaining why>"
}`;

export class Strategist extends BaseAgent {
  readonly name = 'strategist';

  async planContent(input: PlanContentInput): Promise<PlanContentResult> {
    const userPrompt = [
      `PRODUCT: ${input.productName} — ${input.productOneLiner}`,
      `CAMPAIGN GOAL: ${input.campaignGoal}`,
      '',
      'AVAILABLE LEGENDS:',
      ...input.availableLegends.map(
        (l) => `- id=${l.id} | maturity=${l.maturity} | ${l.summary}`,
      ),
      '',
      'AVAILABLE COMMUNITIES:',
      ...input.availableCommunities.map(
        (c) =>
          `- id=${c.id} | platform=${c.platform} | ${c.name}` +
          (c.culture ? ` | culture: ${c.culture}` : '') +
          (c.rulesSummary ? ` | rules: ${c.rulesSummary}` : ''),
      ),
      ...(input.threadContext ? ['', `THREAD CONTEXT:\n${input.threadContext}`] : []),
      '',
      'Return the JSON plan now.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'strategy',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.5,
      maxTokens: 1024,
      responseFormat: 'json',
    });

    const plan = this.#parsePlan(response.content);

    const availableLegendIds = new Set(input.availableLegends.map((l) => l.id));
    if (!availableLegendIds.has(plan.legendId)) {
      throw new Error(
        `Strategist returned legendId ${plan.legendId} which is not in the available set`,
      );
    }
    const availableCommunityIds = new Set(input.availableCommunities.map((c) => c.id));
    if (!availableCommunityIds.has(plan.communityId)) {
      throw new Error(
        `Strategist returned communityId ${plan.communityId} which is not in the available set`,
      );
    }

    return {
      plan,
      llm: {
        providerId: response.providerId,
        model: response.model,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }

  #parsePlan(raw: string): StrategistPlan {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(stripped);
    } catch (err) {
      throw new StrategistFormatError(raw, err);
    }

    const parsed = planSchema.safeParse(json);
    if (!parsed.success) {
      throw new StrategistFormatError(raw, parsed.error);
    }
    return parsed.data;
  }
}
```

- [ ] **Step 1.4: Run + commit**

```bash
pnpm --filter @advocate/app test strategist
pnpm lint
git add packages/app/src/agents/strategist.ts packages/app/tests/agents/strategist.test.ts
git commit -m "feat(app): add Strategist agent (plans legend + community + content type per task)"
```

---

## Task 2: CampaignLead Agent

**Files:**
- Create: `packages/app/src/agents/campaign-lead.ts`
- Create: `packages/app/tests/agents/campaign-lead.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Create `packages/app/tests/agents/campaign-lead.test.ts`:

```typescript
import {
  InMemoryBudgetTracker,
  InMemoryLLMRouter,
  StubLLMProvider,
} from '@advocate/engine';
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

const APPROVE = JSON.stringify({ decision: 'post', reasoning: 'Quality is high, safety passes, promo level fits.' });
const REVISE = JSON.stringify({ decision: 'revise', reasoning: 'Draft is too formal for r/Plumbing.' });
const REJECT = JSON.stringify({ decision: 'reject', reasoning: 'Fundamentally violates never-do rules.' });
const ESCALATE = JSON.stringify({ decision: 'escalate', reasoning: 'Promotion level 7 requires human sign-off.' });

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
    const fenced = '```json\n' + APPROVE + '\n```';
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
```

- [ ] **Step 2.2: Run — MUST FAIL**

```bash
pnpm --filter @advocate/app test campaign-lead
```

- [ ] **Step 2.3: Implement `packages/app/src/agents/campaign-lead.ts`**

```typescript
import { z } from 'zod';
import { BaseAgent } from './base-agent.js';

export class CampaignLeadFormatError extends Error {
  constructor(public readonly rawResponse: string, cause?: unknown) {
    super(
      `Campaign Lead LLM returned malformed output. First 200 chars: ${rawResponse.slice(0, 200)}`,
    );
    this.name = 'CampaignLeadFormatError';
    if (cause) this.cause = cause;
  }
}

export interface QualityScoreInput {
  authenticity: number;
  value: number;
  promotionalSmell: number;
  personaConsistency: number;
  communityFit: number;
  comments: string;
}

export interface SafetyResultInput {
  allowed: boolean;
  reason?: string;
}

export interface DecideOnContentInput {
  draftContent: string;
  /** One-paragraph persona summary (Soul prompt prefix or similar). */
  personaSummary: string;
  qualityScore: QualityScoreInput;
  safetyResult: SafetyResultInput;
  promotionLevel: number;
  campaignGoal: string;
}

const decisionSchema = z.object({
  decision: z.enum(['post', 'revise', 'reject', 'escalate']),
  reasoning: z.string().min(1),
});

export type CampaignLeadDecision = z.infer<typeof decisionSchema>;

export interface DecideOnContentResult {
  decision: CampaignLeadDecision;
  /** Present only when the LLM was called. Null when decision was forced by safety/ruleset. */
  llm: {
    providerId: string;
    model: string;
    costMillicents: number;
    latencyMs: number;
  } | null;
}

const SYSTEM_PROMPT = `You are the Campaign Lead for an organic community promotion system. You make the final call on whether a draft gets posted. Your options:

- post: approve the draft as-is
- revise: send it back to Content Writer with feedback
- reject: the draft is unusable; don't try to revise it
- escalate: requires human sign-off (promotion level >= 6 should usually escalate)

You MUST respond with ONLY a JSON object — no prose, no markdown fences.

Return shape:
{
  "decision": "post" | "revise" | "reject" | "escalate",
  "reasoning": "<1-2 sentences explaining why>"
}`;

export class CampaignLead extends BaseAgent {
  readonly name = 'campaign-lead';

  async decideOnContent(input: DecideOnContentInput): Promise<DecideOnContentResult> {
    // Safety is a hard gate — never override with the LLM.
    if (!input.safetyResult.allowed) {
      return {
        decision: {
          decision: 'reject',
          reasoning: `Safety blocked: ${input.safetyResult.reason ?? 'reason unspecified'}`,
        },
        llm: null,
      };
    }

    const userPrompt = [
      `CAMPAIGN GOAL: ${input.campaignGoal}`,
      `PROMOTION LEVEL: ${input.promotionLevel}/10`,
      '',
      `PERSONA: ${input.personaSummary}`,
      '',
      'DRAFT:',
      input.draftContent,
      '',
      'QUALITY SCORES (1-10):',
      `- Authenticity: ${input.qualityScore.authenticity}`,
      `- Value: ${input.qualityScore.value}`,
      `- Promotional smell: ${input.qualityScore.promotionalSmell}`,
      `- Persona consistency: ${input.qualityScore.personaConsistency}`,
      `- Community fit: ${input.qualityScore.communityFit}`,
      `- Reviewer comments: ${input.qualityScore.comments}`,
      '',
      'SAFETY: allowed',
      '',
      'Make the call. Return JSON now.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'strategy',
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.4,
      maxTokens: 512,
      responseFormat: 'json',
    });

    const decision = this.#parseDecision(response.content);

    return {
      decision,
      llm: {
        providerId: response.providerId,
        model: response.model,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }

  #parseDecision(raw: string): CampaignLeadDecision {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(stripped);
    } catch (err) {
      throw new CampaignLeadFormatError(raw, err);
    }
    const parsed = decisionSchema.safeParse(json);
    if (!parsed.success) {
      throw new CampaignLeadFormatError(raw, parsed.error);
    }
    return parsed.data;
  }
}
```

- [ ] **Step 2.4: Run + commit**

```bash
pnpm --filter @advocate/app test campaign-lead
pnpm lint
git add packages/app/src/agents/campaign-lead.ts packages/app/tests/agents/campaign-lead.test.ts
git commit -m "feat(app): add CampaignLead agent (post/revise/reject/escalate final call)"
```

---

## Task 3: HTTP Routes + Docker Verification + Tag

**Files:**
- Modify: `packages/app/src/server/routes/agents.ts` — add the two endpoints
- Create: `packages/app/tests/agents/strategist.http.test.ts`
- Create: `packages/app/tests/agents/campaign-lead.http.test.ts`

- [ ] **Step 3.1: Extend `packages/app/src/server/routes/agents.ts`**

Inside `registerAgentRoutes`, after the SafetyWorker setup, add:

```typescript
const strategist = new Strategist({
  router: deps.router,
  db: getDb(),
  logger: deps.logger,
});
const campaignLead = new CampaignLead({
  router: deps.router,
  db: getDb(),
  logger: deps.logger,
});

const strategistSchema = z.object({
  productName: z.string().min(1),
  productOneLiner: z.string().min(1),
  campaignGoal: z.string().min(1),
  availableLegends: z
    .array(
      z.object({
        id: z.string().uuid(),
        summary: z.string().min(1),
        maturity: z.enum(['lurking', 'engaging', 'established', 'promoting']),
      }),
    )
    .min(1),
  availableCommunities: z
    .array(
      z.object({
        id: z.string().uuid(),
        platform: z.string().min(1),
        name: z.string().min(1),
        culture: z.string().optional(),
        rulesSummary: z.string().optional(),
      }),
    )
    .min(1),
  threadContext: z.string().optional(),
});

app.post('/agents/strategist/plan', async (req, reply) => {
  const parsed = strategistSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'ValidationError',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  try {
    return await strategist.planContent(parsed.data);
  } catch (err) {
    if (err instanceof StrategistFormatError) {
      return reply.code(502).send({
        error: 'BadGateway',
        message: 'Strategist LLM returned malformed output',
        rawPreview: err.rawResponse.slice(0, 1500),
      });
    }
    if (err instanceof Error && /not in the available set/i.test(err.message)) {
      return reply.code(502).send({
        error: 'BadGateway',
        message: err.message,
      });
    }
    req.log.error({ err }, 'strategist failed');
    return reply.code(500).send({ error: 'InternalServerError' });
  }
});

const campaignLeadSchema = z.object({
  draftContent: z.string().min(1),
  personaSummary: z.string().min(1),
  qualityScore: z.object({
    authenticity: z.number().min(1).max(10),
    value: z.number().min(1).max(10),
    promotionalSmell: z.number().min(1).max(10),
    personaConsistency: z.number().min(1).max(10),
    communityFit: z.number().min(1).max(10),
    comments: z.string(),
  }),
  safetyResult: z.object({
    allowed: z.boolean(),
    reason: z.string().optional(),
  }),
  promotionLevel: z.number().int().min(0).max(10),
  campaignGoal: z.string().min(1),
});

app.post('/agents/campaign-lead/decide', async (req, reply) => {
  const parsed = campaignLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: 'ValidationError',
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    });
  }
  try {
    const result = await campaignLead.decideOnContent(parsed.data);
    // Escalate maps to 202 Accepted (human action pending)
    if (result.decision.decision === 'escalate') {
      return reply.code(202).send(result);
    }
    return result;
  } catch (err) {
    if (err instanceof CampaignLeadFormatError) {
      return reply.code(502).send({
        error: 'BadGateway',
        message: 'Campaign Lead LLM returned malformed output',
        rawPreview: err.rawResponse.slice(0, 1500),
      });
    }
    req.log.error({ err }, 'campaign lead failed');
    return reply.code(500).send({ error: 'InternalServerError' });
  }
});
```

Imports at the top of the file:

```typescript
import { CampaignLead, CampaignLeadFormatError } from '../../agents/campaign-lead.js';
import { Strategist, StrategistFormatError } from '../../agents/strategist.js';
```

- [ ] **Step 3.2: HTTP tests (shortened — follow the QualityGate/SafetyWorker HTTP test pattern)**

`strategist.http.test.ts`:
- POST valid input → 200 with plan (may be skipped or allow stub response if no keys)
- POST missing fields → 400
- (Include at least one test that doesn't need a real LLM — e.g. 400 on missing `availableLegends`)

`campaign-lead.http.test.ts`:
- POST with `safetyResult.allowed: false` → 200 with `decision: 'reject'` (no LLM needed)
- POST missing fields → 400

Using `buildServer()` + `app.inject()`.

- [ ] **Step 3.3: Run + commit + push**

```bash
pnpm --filter @advocate/app test agents
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/agents.ts packages/app/tests/agents/strategist.http.test.ts packages/app/tests/agents/campaign-lead.http.test.ts
git commit -m "feat(app): add /agents/strategist/plan + /agents/campaign-lead/decide routes"
git push origin master
```

- [ ] **Step 3.4: Docker round-trip**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

- [ ] **Step 3.5: Tag + push**

```bash
git tag -a plan11c-complete -m "Plan 11c Strategist + CampaignLead agents complete"
git push origin plan11c-complete
```

---

## Acceptance Criteria

1. ✅ `Strategist.planContent(input)` returns structured plan (legendId + communityId + contentType + promotionLevel + reasoning)
2. ✅ Strategist validates LLM output IDs against the available set
3. ✅ `CampaignLead.decideOnContent(input)` returns one of `post` / `revise` / `reject` / `escalate`
4. ✅ CampaignLead short-circuits to `reject` when `safetyResult.allowed === false` (no LLM call)
5. ✅ HTTP endpoints: `/agents/strategist/plan` + `/agents/campaign-lead/decide`, latter returns 202 for escalate
6. ✅ Tests: ~7 Strategist unit + ~9 CampaignLead unit + HTTP tests
7. ✅ Docker stack boots healthy
8. ✅ Tag `plan11c-complete` pushed

## Out of Scope

- **Agent pipeline** (calling these from other agents in sequence) → Plan 11d
- **BullMQ orchestration** → Plan 11e
- **Persisting strategist plans as content_plans rows** → Plan 11d
- **Analytics / Scout agents** → separate follow-up plan when needed

---

**End of Plan 11c (Orchestrator Agents).**
