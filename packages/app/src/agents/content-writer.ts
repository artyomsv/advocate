import { eq } from 'drizzle-orm';
import { legends, products } from '../db/schema.js';
import { composePrompt } from '../prompts/composer.js';
import { BaseAgent } from './base-agent.js';
import type { DraftRequest, DraftResponse } from './types.js';

export class ContentWriter extends BaseAgent {
  readonly name = 'content-writer';

  async generateDraft(request: DraftRequest): Promise<DraftResponse> {
    const [legend] = await this.deps.db
      .select()
      .from(legends)
      .where(eq(legends.id, request.legendId))
      .limit(1);
    if (!legend) {
      throw new Error(`Legend ${request.legendId} not found`);
    }

    let product = null;
    if (request.productId) {
      const [row] = await this.deps.db
        .select()
        .from(products)
        .where(eq(products.id, request.productId))
        .limit(1);
      if (!row) {
        throw new Error(`Product ${request.productId} not found`);
      }
      product = row;
    }

    const composed = composePrompt({
      legend,
      product,
      context: {
        task: request.task,
        platform: request.platform,
        community: request.community,
        thread: request.thread,
        relevantMemories: request.relevantMemories,
        recentActivity: request.recentActivity,
      },
    });

    const response = await this.callLlm({
      taskType: 'content_writing',
      systemPrompt: composed.systemPrompt,
      userPrompt: composed.userPrompt,
      temperature: 0.8,
    });

    return {
      content: response.content,
      systemPrompt: composed.systemPrompt,
      userPrompt: composed.userPrompt,
      llm: {
        providerId: response.providerId,
        model: response.model,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
        cachedTokens: response.usage.cachedTokens ?? 0,
        costMillicents: response.costMillicents,
        latencyMs: response.latencyMs,
      },
    };
  }
}
