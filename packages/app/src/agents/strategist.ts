import { z } from 'zod';
import { BaseAgent } from './base-agent.js';

export class StrategistFormatError extends Error {
  constructor(
    public readonly rawResponse: string,
    cause?: unknown,
  ) {
    super(
      `Strategist LLM returned malformed output. First 200 chars: ${rawResponse.slice(0, 200)}`,
    );
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
  /**
   * Optional: recent Analytics Analyst learnings for this product. The
   * Strategist folds them into the prompt as "RECENT LEARNINGS". Newest first.
   */
  recentInsights?: readonly string[];
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

export const STRATEGIST_SYSTEM_PROMPT = `You are a strategist for an organic community promotion system. Your job is to choose the best legend + community + content type + promotion level for the next post. You MUST respond with ONLY a JSON object — no prose, no markdown.

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
      ...input.availableLegends.map((l) => `- id=${l.id} | maturity=${l.maturity} | ${l.summary}`),
      '',
      'AVAILABLE COMMUNITIES:',
      ...input.availableCommunities.map(
        (c) =>
          `- id=${c.id} | platform=${c.platform} | ${c.name}` +
          (c.culture ? ` | culture: ${c.culture}` : '') +
          (c.rulesSummary ? ` | rules: ${c.rulesSummary}` : ''),
      ),
      ...(input.threadContext ? ['', `THREAD CONTEXT:\n${input.threadContext}`] : []),
      ...(input.recentInsights && input.recentInsights.length > 0
        ? ['', 'RECENT LEARNINGS (from Analytics Analyst, newest first):', ...input.recentInsights]
        : []),
      '',
      'Return the JSON plan now.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'strategy',
      systemPrompt: STRATEGIST_SYSTEM_PROMPT,
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
