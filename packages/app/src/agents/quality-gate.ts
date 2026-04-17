import { z } from 'zod';
import { BaseAgent } from './base-agent.js';

export class QualityGateFormatError extends Error {
  constructor(
    public readonly rawResponse: string,
    cause?: unknown,
  ) {
    super(
      `Quality gate LLM returned malformed output. First 200 chars: ${rawResponse.slice(0, 200)}`,
    );
    this.name = 'QualityGateFormatError';
    if (cause) this.cause = cause;
  }
}

export interface QualityGateInput {
  draftContent: string;
  /** One-paragraph summary of the persona's voice — callers can pass the Soul prompt prefix. */
  personaSummary: string;
  /** Community rules / culture summary for judging community fit. */
  communityRules: string;
  /** The promotion level this draft was generated for (0-10). Affects approval threshold. */
  promotionLevel: number;
}

export interface QualityScore {
  authenticity: number;
  value: number;
  promotionalSmell: number;
  personaConsistency: number;
  communityFit: number;
}

export interface QualityGateResult {
  approved: boolean;
  score: QualityScore;
  comments: string;
  llm: {
    providerId: string;
    model: string;
    costMillicents: number;
    latencyMs: number;
  };
}

const scoreSchema = z.object({
  authenticity: z.number().min(1).max(10),
  value: z.number().min(1).max(10),
  promotionalSmell: z.number().min(1).max(10),
  personaConsistency: z.number().min(1).max(10),
  communityFit: z.number().min(1).max(10),
  comments: z.string(),
});

export const QUALITY_GATE_SYSTEM_PROMPT = `You are a content quality reviewer for an organic community promotion system. Your job is to score a draft post against five criteria and return ONLY a JSON object — no prose before or after.

Score each criterion 1–10:
- authenticity: Does this read like a real human wrote it? (10 = indistinguishable from genuine)
- value: Would the community find this genuinely helpful or interesting? (10 = highly valuable)
- promotionalSmell: How promotional does it feel? (10 = obvious ad, 1 = pure value, no promo)
- personaConsistency: Does this match the described persona's voice? (10 = perfect voice match)
- communityFit: Does this match the community's culture and rules? (10 = perfect fit)

Also return:
- comments: one or two sentences summarizing your overall assessment

Respond with ONLY the JSON object. No markdown fences, no prose.`;

export class QualityGate extends BaseAgent {
  readonly name = 'quality-gate';

  async review(input: QualityGateInput): Promise<QualityGateResult> {
    const userPrompt = [
      `DRAFT:\n${input.draftContent}`,
      '',
      `PERSONA SUMMARY:\n${input.personaSummary}`,
      '',
      `COMMUNITY CONTEXT:\n${input.communityRules || '(no specific rules provided)'}`,
      '',
      `PROMOTION LEVEL: ${input.promotionLevel}/10`,
      '',
      'Return the JSON score object now.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt: QUALITY_GATE_SYSTEM_PROMPT,
      userPrompt,
      temperature: 0.2,
      maxTokens: 1024,
      responseFormat: 'json',
    });

    const parsed = this.#parseScore(response.content);

    const approved = this.#isApproved(parsed, input.promotionLevel);

    return {
      approved,
      score: {
        authenticity: parsed.authenticity,
        value: parsed.value,
        promotionalSmell: parsed.promotionalSmell,
        personaConsistency: parsed.personaConsistency,
        communityFit: parsed.communityFit,
      },
      comments: parsed.comments,
      llm: {
        providerId: response.providerId,
        model: response.model,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }

  #parseScore(raw: string): z.infer<typeof scoreSchema> {
    const stripped = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    let json: unknown;
    try {
      json = JSON.parse(stripped);
    } catch (err) {
      throw new QualityGateFormatError(raw, err);
    }

    const result = scoreSchema.safeParse(json);
    if (!result.success) {
      throw new QualityGateFormatError(raw, result.error);
    }
    return result.data;
  }

  #isApproved(score: z.infer<typeof scoreSchema>, promotionLevel: number): boolean {
    // Below promotion level 7, a promo smell > 4 means the draft feels like an ad.
    if (promotionLevel < 7 && score.promotionalSmell > 4) return false;
    if (score.authenticity < 6) return false;
    if (score.value < 5) return false;
    return true;
  }
}
