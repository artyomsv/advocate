import { and, desc, eq, gte } from 'drizzle-orm';
import { BaseAgent } from './base-agent.js';
import { resolveSoul } from './soul-loader.js';
import type { AgentDeps } from './types.js';
import { consolidatedMemories, episodicMemories } from '../db/schema.js';

/**
 * System prompt for the MemoryConsolidator. Explicitly rejects product-
 * specific content so the resulting lessons are safe to share across all
 * products. This is the "why shared memory works without cross-contamination"
 * guardrail — the prompt plus a pre-send context sanitiser (below).
 */
export const MEMORY_CONSOLIDATOR_SYSTEM_PROMPT = `You consolidate agent run episodes into REUSABLE CRAFT LESSONS. You will receive a list of episodes from one agent across multiple products over a time window.

Your output is JSON: { "summary": "one-sentence period recap", "lessons": ["lesson 1", "lesson 2", ...] }

ACCEPT lessons about:
- Community norms (e.g. "r/cooking downvotes titles that read as ads")
- Content structure + tone (e.g. "posts under 800 chars outperform in r/frugal")
- Timing patterns (e.g. "09:00-11:00 EST scans produce 3x dispatches")
- Safety traps (e.g. "promo level >= 5 triggers mod removal in r/X")
- Quality calibration (e.g. "authenticity < 6 correlates with rejection")

REJECT lessons that are:
- Product-specific (mentioning product names, pain points, talking points)
- Legend-specific voice notes (those go in per-legend soul tuning)
- Competitor references
- Audience segment specifics ("moms of 4yr olds prefer X" — too narrow)

If you see no generalisable lessons, return { "summary": "...", "lessons": [] }. Do not invent lessons.`;

export interface ConsolidateInput {
  agentId: string;
  periodFrom: Date;
  periodTo: Date;
}

export interface ConsolidateResult {
  summary: string;
  lessons: string[];
  sourceEpisodeIds: string[];
  periodFrom: Date;
  periodTo: Date;
}

export class MemoryConsolidator extends BaseAgent {
  readonly name = 'memory-consolidator';

  constructor(deps: AgentDeps) {
    super(deps);
  }

  async consolidate(input: ConsolidateInput): Promise<ConsolidateResult | null> {
    // Pull this agent's episodes in the window — across ALL products.
    // The consolidator deliberately aggregates across products so the
    // resulting lessons are ones that generalise beyond any single one.
    const episodes = await this.deps.db
      .select()
      .from(episodicMemories)
      .where(
        and(
          eq(episodicMemories.agentId, input.agentId),
          gte(episodicMemories.createdAt, input.periodFrom),
        ),
      )
      .orderBy(desc(episodicMemories.createdAt))
      .limit(200);

    if (episodes.length < 5) return null; // too few to generalise

    // Sanitise context before handing off to the LLM — strip anything that
    // identifies a specific product/legend. Keep community + platform so
    // community-level lessons ("r/cooking behaves like X") still work.
    const sanitised = episodes.map((e) => {
      const ctx = (e.context ?? {}) as {
        communityId?: string;
        platform?: string;
      };
      return {
        action: e.action,
        outcome: e.outcome,
        sentiment: e.sentiment,
        context: {
          communityId: ctx.communityId,
          platform: ctx.platform,
        },
      };
    });

    const soul = await resolveSoul(
      this.deps.db,
      'memoryConsolidator',
      MEMORY_CONSOLIDATOR_SYSTEM_PROMPT,
    );

    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt: soul,
      userPrompt: `Episodes (newest first):\n\n${JSON.stringify(sanitised, null, 2)}`,
      responseFormat: 'json',
      maxTokens: 1024,
      temperature: 0.2,
    });

    let parsed: { summary?: string; lessons?: unknown };
    try {
      parsed = JSON.parse(response.content);
    } catch {
      return null;
    }

    const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
    const lessons = Array.isArray(parsed.lessons)
      ? parsed.lessons.filter((l): l is string => typeof l === 'string')
      : [];

    if (lessons.length === 0) return null;

    await this.deps.db.insert(consolidatedMemories).values({
      agentId: input.agentId,
      sourceEpisodeIds: episodes.map((e) => e.id),
      summary,
      lessons,
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
    });

    return {
      summary,
      lessons,
      sourceEpisodeIds: episodes.map((e) => e.id),
      periodFrom: input.periodFrom,
      periodTo: input.periodTo,
    };
  }
}
