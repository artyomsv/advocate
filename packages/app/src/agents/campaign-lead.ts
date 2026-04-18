import { z } from 'zod';
import { SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import { BaseAgent } from './base-agent.js';
import { formatLessons, loadLessons } from './lessons-loader.js';
import { resolveSoul } from './soul-loader.js';

export class CampaignLeadFormatError extends Error {
  constructor(
    public readonly rawResponse: string,
    cause?: unknown,
  ) {
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

export const CAMPAIGN_LEAD_SYSTEM_PROMPT = `You are the Campaign Lead for an organic community promotion system. You make the final call on whether a draft gets posted. Your options:

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
      systemPrompt: await resolveSoul(this.deps.db, 'campaignLead', CAMPAIGN_LEAD_SYSTEM_PROMPT),
      userPrompt:
        userPrompt +
        formatLessons(await loadLessons(this.deps.db, SEED_AGENT_IDS.campaignLead)),
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
