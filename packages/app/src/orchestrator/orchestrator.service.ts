import { desc, eq, inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pino from 'pino';
import { CampaignLead } from '../agents/campaign-lead.js';
import { ContentWriter } from '../agents/content-writer.js';
import { QualityGate } from '../agents/quality-gate.js';
import { SafetyWorker } from '../agents/safety-worker.js';
import { Strategist } from '../agents/strategist.js';
import type { AgentDeps } from '../agents/types.js';
import { ContentPlanRepository } from '../content-plans/content-plan.repository.js';
import type * as schema from '../db/schema.js';
import { communities, insights, legendAccounts, legends, products } from '../db/schema.js';
import type { ReviewDispatcher } from '../notifications/review-dispatcher.js';
import {
  type DraftOrchestrationInput,
  type DraftOrchestrationResult,
  OrchestratorNoAccountError,
  OrchestratorNoCommunitiesError,
  OrchestratorNoLegendsError,
} from './types.js';

export interface OrchestratorDeps extends AgentDeps {
  reviewDispatcher?: ReviewDispatcher;
}

export class OrchestratorService {
  readonly #deps: AgentDeps;
  readonly #dispatcher: ReviewDispatcher | undefined;
  readonly #repo: ContentPlanRepository;
  readonly #strategist: Strategist;
  readonly #writer: ContentWriter;
  readonly #gate: QualityGate;
  readonly #safety: SafetyWorker;
  readonly #lead: CampaignLead;

  constructor(deps: OrchestratorDeps) {
    this.#deps = deps;
    this.#dispatcher = deps.reviewDispatcher;
    this.#repo = new ContentPlanRepository(deps.db);
    this.#strategist = new Strategist(deps);
    this.#writer = new ContentWriter(deps);
    this.#gate = new QualityGate(deps);
    this.#safety = new SafetyWorker(deps);
    this.#lead = new CampaignLead(deps);
  }

  async draft(input: DraftOrchestrationInput): Promise<DraftOrchestrationResult> {
    const log = this.#deps.logger.child({ component: 'orchestrator' });
    log.info({ productId: input.productId }, 'orchestrator: starting draft');

    // 1. Load context
    const [product] = await this.#deps.db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error(`Product ${input.productId} not found`);

    const legendRows = await this.#deps.db
      .select()
      .from(legends)
      .where(
        input.legendIds && input.legendIds.length > 0
          ? inArray(legends.id, [...input.legendIds])
          : eq(legends.productId, input.productId),
      );
    if (legendRows.length === 0) {
      throw new OrchestratorNoLegendsError(input.productId);
    }

    const communityRows =
      input.communityIds && input.communityIds.length > 0
        ? await this.#deps.db
            .select()
            .from(communities)
            .where(inArray(communities.id, [...input.communityIds]))
        : await this.#deps.db.select().from(communities);
    if (communityRows.length === 0) {
      throw new OrchestratorNoCommunitiesError();
    }

    // 2. Strategist — fold recent insights into the prompt if any exist
    const recentInsightRows = await this.#deps.db
      .select({ body: insights.body })
      .from(insights)
      .where(eq(insights.productId, product.id))
      .orderBy(desc(insights.generatedAt))
      .limit(3);
    const recentInsights = recentInsightRows.map((r) => r.body);

    const strategistResult = await this.#strategist.planContent({
      productName: product.name,
      productOneLiner: product.description,
      campaignGoal: input.campaignGoal,
      availableLegends: legendRows.map((l) => ({
        id: l.id,
        summary: this.#summarizeLegend(l),
        maturity: l.maturity as 'lurking' | 'engaging' | 'established' | 'promoting',
      })),
      availableCommunities: communityRows.map((c) => ({
        id: c.id,
        platform: c.platform,
        name: c.name,
        culture: c.cultureSummary ?? undefined,
        rulesSummary: c.rulesSummary ?? undefined,
      })),
      threadContext: input.threadContext,
      recentInsights: recentInsights.length > 0 ? recentInsights : undefined,
    });
    const plan = strategistResult.plan;
    log.info({ plan }, 'orchestrator: strategist plan');

    // Find the account on the chosen community's platform for the chosen legend
    const chosenCommunity = communityRows.find((c) => c.id === plan.communityId);
    if (!chosenCommunity) throw new OrchestratorNoCommunitiesError();
    const [account] = await this.#deps.db
      .select()
      .from(legendAccounts)
      .where(eq(legendAccounts.legendId, plan.legendId))
      .limit(1);
    if (!account) {
      throw new OrchestratorNoAccountError(plan.legendId, chosenCommunity.platform);
    }

    // 3. Content Writer
    const draftResult = await this.#writer.generateDraft({
      legendId: plan.legendId,
      productId: input.productId,
      communityId: plan.communityId,
      task: {
        type: plan.contentType,
        promotionLevel: plan.promotionLevel,
        instructions: `${plan.reasoning}\n\nWrite a ${plan.contentType} appropriate for ${chosenCommunity.name}.`,
      },
      community: {
        id: chosenCommunity.id,
        name: chosenCommunity.name,
        platform: chosenCommunity.platform,
        cultureSummary: chosenCommunity.cultureSummary ?? undefined,
        rulesSummary: chosenCommunity.rulesSummary ?? undefined,
      },
      thread: input.threadContext ? { summary: input.threadContext } : undefined,
    });
    log.info(
      { contentChars: draftResult.content.length, cost: draftResult.llm.costMillicents },
      'orchestrator: draft generated',
    );

    // 4. Quality Gate
    const qualityResult = await this.#gate.review({
      draftContent: draftResult.content,
      personaSummary: draftResult.systemPrompt.slice(0, 500),
      communityRules: chosenCommunity.rulesSummary ?? '',
      promotionLevel: plan.promotionLevel,
    });
    log.info(
      { approved: qualityResult.approved, score: qualityResult.score },
      'orchestrator: quality review complete',
    );

    // 5. Safety Worker
    const safetyResult = await this.#safety.check({
      legendAccountId: account.id,
      promotionLevel: plan.promotionLevel,
    });
    log.info(
      { allowed: safetyResult.allowed, reason: safetyResult.reason },
      'orchestrator: safety check',
    );

    // 6. Campaign Lead (or short-circuit if safety blocked)
    const leadResult = await this.#lead.decideOnContent({
      draftContent: draftResult.content,
      personaSummary: draftResult.systemPrompt.slice(0, 500),
      qualityScore: qualityResult.score
        ? { ...qualityResult.score, comments: qualityResult.comments }
        : {
            authenticity: 0,
            value: 0,
            promotionalSmell: 10,
            personaConsistency: 0,
            communityFit: 0,
            comments: 'quality gate did not produce scores',
          },
      safetyResult,
      promotionLevel: plan.promotionLevel,
      campaignGoal: input.campaignGoal,
    });
    log.info({ decision: leadResult.decision.decision }, 'orchestrator: campaign lead decision');

    // 7. Map decision to content_plan status + persist
    const { status, rejectionReason, reviewedBy } = this.#mapDecision(
      leadResult.decision,
      safetyResult,
    );

    const contentPlan = await this.#repo.create({
      legendId: plan.legendId,
      legendAccountId: account.id,
      communityId: plan.communityId,
      contentType: plan.contentType,
      promotionLevel: plan.promotionLevel,
      scheduledAt: new Date(),
      status,
      generatedContent: draftResult.content,
      qualityScore: {
        ...qualityResult.score,
        comments: qualityResult.comments,
        reviewedBy: qualityResult.llm.providerId,
      },
      reviewedBy,
      reviewedAt: new Date(),
      rejectionReason,
      threadContext: input.threadContext,
    });

    // Optional: fire Telegram approval message when plan lands at review.
    // Silently no-ops when no dispatcher is attached.
    await this.#dispatcher?.dispatchIfReview(contentPlan);

    const totalCostMillicents =
      strategistResult.llm.costMillicents +
      draftResult.llm.costMillicents +
      qualityResult.llm.costMillicents +
      (leadResult.llm?.costMillicents ?? 0);

    return {
      contentPlan,
      trace: {
        strategistPlan: plan,
        draftContent: draftResult.content,
        quality: qualityResult,
        safety: safetyResult,
        decision: leadResult.decision,
      },
      totalCostMillicents,
    };
  }

  #summarizeLegend(legend: typeof legends.$inferSelect): string {
    const professional = legend.professional as { occupation?: string } | null;
    const loc = legend.location as { city?: string; state?: string } | null;
    return (
      `${legend.firstName} ${legend.lastName}, age ${legend.age}, ` +
      `${professional?.occupation ?? 'unknown'} in ${loc?.city ?? '?'} ${loc?.state ?? ''}. ` +
      `Tech: ${legend.techSavviness}/10. Maturity: ${legend.maturity}.`
    );
  }

  #mapDecision(
    decision: { decision: string; reasoning: string },
    safetyResult: { allowed: boolean; reason?: string },
  ): {
    status: 'approved' | 'rejected' | 'review';
    rejectionReason?: string;
    reviewedBy: string;
  } {
    if (!safetyResult.allowed) {
      return {
        status: 'rejected',
        rejectionReason: `safety: ${safetyResult.reason ?? 'blocked'}`,
        reviewedBy: 'orchestrator',
      };
    }
    switch (decision.decision) {
      case 'post':
        return { status: 'approved', reviewedBy: 'orchestrator' };
      case 'revise':
        return {
          status: 'rejected',
          rejectionReason: `needs revision: ${decision.reasoning}`,
          reviewedBy: 'orchestrator',
        };
      case 'reject':
        return {
          status: 'rejected',
          rejectionReason: decision.reasoning,
          reviewedBy: 'orchestrator',
        };
      case 'escalate':
        return { status: 'review', reviewedBy: 'orchestrator' };
      default:
        return {
          status: 'rejected',
          rejectionReason: `unknown decision: ${decision.decision}`,
          reviewedBy: 'orchestrator',
        };
    }
  }
}
