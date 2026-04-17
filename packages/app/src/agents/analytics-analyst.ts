import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { BaseAgent } from './base-agent.js';
import type { AgentDeps } from './types.js';
import { insights, legends, posts } from '../db/schema.js';

export interface GenerateInsightInput {
  productId: string;
  /** Look back this many days for the engagement window. Default 30. */
  lookbackDays?: number;
}

export interface GenerateInsightResult {
  insightId: string | null;
  postsConsidered: number;
}

/**
 * Summarizes what's working based on persisted post engagement. Writes one
 * row to `insights` per call. Strategist reads the most recent insights
 * when composing its plan-selection prompt.
 */
export class AnalyticsAnalyst extends BaseAgent {
  readonly name = 'analytics-analyst';

  async generate(input: GenerateInsightInput): Promise<GenerateInsightResult> {
    const lookbackDays = input.lookbackDays ?? 30;
    const windowStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    // Join posts → legend_accounts → legends (to filter by productId)
    const rows = await this.deps.db
      .select({
        id: posts.id,
        contentType: posts.contentType,
        promotionLevel: posts.promotionLevel,
        upvotes: posts.upvotes,
        repliesCount: posts.repliesCount,
        wasRemoved: posts.wasRemoved,
        postedAt: posts.postedAt,
        communityId: posts.communityId,
      })
      .from(posts)
      .innerJoin(legends, eq(legends.productId, input.productId))
      .where(and(eq(legends.productId, input.productId), gt(posts.postedAt, windowStart)))
      .orderBy(desc(posts.postedAt))
      .limit(100);

    if (rows.length === 0) {
      return { insightId: null, postsConsidered: 0 };
    }

    const userPrompt = [
      `Lookback window: last ${lookbackDays} days · ${rows.length} posts`,
      '',
      'Posts (content_type | L<promotion_level> | upvotes | replies | removed?):',
      ...rows.map(
        (r) =>
          `  - ${r.contentType} | L${r.promotionLevel} | ${r.upvotes}↑ | ${r.repliesCount} replies | removed=${r.wasRemoved}`,
      ),
      '',
      'Write 3-5 bullet insights for the Strategist. Focus on patterns the',
      'Strategist can act on: which content types + promotion levels + (if',
      'obvious) communities drive engagement. Each bullet ≤ 140 chars. No',
      'preamble — bullets only.',
    ].join('\n');

    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt:
        'You are the Analytics Analyst for a content-promotion system. Produce concise, actionable learnings.',
      userPrompt,
      maxTokens: 512,
      temperature: 0.3,
    });

    const body = response.content.trim();
    const [row] = await this.deps.db
      .insert(insights)
      .values({
        productId: input.productId,
        body,
        metricsWindow: {
          lookbackDays,
          postCount: rows.length,
          avgUpvotes: Math.round(
            rows.reduce((s, r) => s + r.upvotes, 0) / rows.length,
          ),
        },
      })
      .returning({ id: insights.id });

    this.deps.logger.info(
      { productId: input.productId, insightId: row?.id, postsConsidered: rows.length },
      'insight generated',
    );
    void sql; // reserved
    return { insightId: row?.id ?? null, postsConsidered: rows.length };
  }
}
