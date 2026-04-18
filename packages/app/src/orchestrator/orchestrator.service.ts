import type { AgentId, ProjectId, TaskId, TaskStatus } from '@mynah/engine';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type pino from 'pino';
import { CampaignLead } from '../agents/campaign-lead.js';
import { ContentWriter } from '../agents/content-writer.js';
import { QualityGate } from '../agents/quality-gate.js';
import { SafetyWorker } from '../agents/safety-worker.js';
import { Strategist } from '../agents/strategist.js';
import type { AgentDeps } from '../agents/types.js';
import { ensureSeededAgents, SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import { ContentPlanRepository } from '../content-plans/content-plan.repository.js';
import { communities, insights, legendAccounts, legends, products } from '../db/schema.js';
import { DrizzleEpisodicMemoryStore } from '../engine-stores/memory/drizzle-episodic-store.js';
import { DrizzleConversationLog } from '../engine-stores/messaging/drizzle-conversation-log.js';
import { DrizzleKanbanBoard } from '../engine-stores/tasks/drizzle-kanban-board.js';
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
  readonly #board: DrizzleKanbanBoard;
  readonly #log: DrizzleConversationLog;
  readonly #memory: DrizzleEpisodicMemoryStore;
  #agentsSeeded = false;

  constructor(deps: OrchestratorDeps) {
    this.#deps = deps;
    this.#dispatcher = deps.reviewDispatcher;
    this.#repo = new ContentPlanRepository(deps.db);
    this.#strategist = new Strategist(deps);
    this.#writer = new ContentWriter(deps);
    this.#gate = new QualityGate(deps);
    this.#safety = new SafetyWorker(deps);
    this.#lead = new CampaignLead(deps);
    this.#board = new DrizzleKanbanBoard(deps.db);
    this.#log = new DrizzleConversationLog(deps.db);
    this.#memory = new DrizzleEpisodicMemoryStore(deps.db);
  }

  async #recordEpisode(
    agentId: string,
    action: string,
    outcome: string,
    sentiment: 'positive' | 'neutral' | 'negative',
    context?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.#memory.record({
        agentId: agentId as AgentId,
        action,
        outcome,
        sentiment,
        context,
      });
    } catch (err) {
      // Memory is advisory — a write failure must not take down the draft.
      this.#deps.logger.warn({ err, agentId, action }, 'episodic memory write failed');
    }
  }

  /**
   * Transition the trace task and reassign it in one call. Swallows illegal-
   * transition errors rather than failing the draft — the task workflow is
   * advisory, the content pipeline is the source of truth.
   */
  async #transitionTask(
    taskId: TaskId,
    status: TaskStatus,
    actor: string,
    assignTo?: string,
  ): Promise<void> {
    try {
      await this.#board.updateStatus(taskId, status, actor as AgentId);
      if (assignTo) {
        await this.#board.assign(taskId, assignTo as AgentId);
      }
    } catch (err) {
      this.#deps.logger.warn({ err, taskId, status, actor }, 'task transition skipped');
    }
  }

  async draft(input: DraftOrchestrationInput): Promise<DraftOrchestrationResult> {
    const log = this.#deps.logger.child({ component: 'orchestrator' });
    log.info({ productId: input.productId }, 'orchestrator: starting draft');

    if (!this.#agentsSeeded) {
      await ensureSeededAgents(this.#deps.db);
      this.#agentsSeeded = true;
    }

    // 1. Load context
    const [product] = await this.#deps.db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error(`Product ${input.productId} not found`);

    // Create the trace task so every inter-agent message can be scoped via
    // agent_messages.task_id. traceTaskId also lands on the content_plan
    // so the dashboard can fetch the thread directly.
    const traceTask = await this.#board.createTask({
      projectId: input.productId as ProjectId,
      title: `Content draft for ${product.name}`,
      description: input.campaignGoal,
      type: 'content_plan_draft',
      priority: 'medium',
      createdBy: SEED_AGENT_IDS.campaignLead as AgentId,
      assignedTo: SEED_AGENT_IDS.strategist as AgentId,
    });
    const traceTaskId = traceTask.id as TaskId;

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

    await this.#recordEpisode(
      SEED_AGENT_IDS.strategist,
      `Picked legend ${plan.legendId} + community ${plan.communityId} for a ${plan.contentType} at promo level ${plan.promotionLevel}`,
      plan.reasoning.slice(0, 400),
      'neutral',
      { productId: input.productId, traceTaskId },
    );

    // Strategist finished — move task into execution and hand to the Writer.
    await this.#transitionTask(
      traceTaskId,
      'in_progress',
      SEED_AGENT_IDS.strategist,
      SEED_AGENT_IDS.contentWriter,
    );

    await this.#log.append({
      fromAgent: SEED_AGENT_IDS.strategist as AgentId,
      toAgent: SEED_AGENT_IDS.contentWriter as AgentId,
      type: 'request',
      subject: `Draft ${plan.contentType} for ${product.name}`,
      content:
        `Legend ${plan.legendId}, community ${plan.communityId}, ` +
        `promo ${plan.promotionLevel}/10. ${plan.reasoning}`,
      taskId: traceTaskId,
      metadata: {
        costMillicents: strategistResult.llm.costMillicents,
        provider: strategistResult.llm.providerId,
        model: strategistResult.llm.model,
      },
    });

    // Find the account on the chosen community's platform for the chosen
    // legend. Prefer isPrimary=true when multiple accounts exist on the same
    // platform; fall back to the first match.
    const chosenCommunity = communityRows.find((c) => c.id === plan.communityId);
    if (!chosenCommunity) throw new OrchestratorNoCommunitiesError();
    const allAccounts = await this.#deps.db
      .select()
      .from(legendAccounts)
      .where(
        and(
          eq(legendAccounts.legendId, plan.legendId),
          eq(legendAccounts.platform, chosenCommunity.platform),
        ),
      );
    const account = allAccounts.find((a) => a.isPrimary) ?? allAccounts[0];
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

    await this.#recordEpisode(
      SEED_AGENT_IDS.contentWriter,
      `Drafted a ${plan.contentType} (${draftResult.content.length} chars) for ${chosenCommunity.name}`,
      draftResult.content.slice(0, 400),
      'neutral',
      { legendId: plan.legendId, traceTaskId },
    );

    // Writer finished — draft goes into review and gets handed to QualityGate.
    await this.#transitionTask(
      traceTaskId,
      'in_review',
      SEED_AGENT_IDS.contentWriter,
      SEED_AGENT_IDS.qualityGate,
    );

    await this.#log.append({
      fromAgent: SEED_AGENT_IDS.contentWriter as AgentId,
      toAgent: SEED_AGENT_IDS.qualityGate as AgentId,
      type: 'response',
      subject: `Draft ready (${draftResult.content.length} chars)`,
      content: draftResult.content,
      taskId: traceTaskId,
      metadata: {
        costMillicents: draftResult.llm.costMillicents,
        provider: draftResult.llm.providerId,
        model: draftResult.llm.model,
      },
    });

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

    const qualitySummary = qualityResult.score
      ? `auth=${qualityResult.score.authenticity} value=${qualityResult.score.value} ` +
        `promoSmell=${qualityResult.score.promotionalSmell} ` +
        `persona=${qualityResult.score.personaConsistency} ` +
        `fit=${qualityResult.score.communityFit}`
      : 'no scores';
    await this.#recordEpisode(
      SEED_AGENT_IDS.qualityGate,
      qualityResult.approved ? 'Approved draft' : 'Flagged draft',
      `${qualitySummary} · ${qualityResult.comments}`.slice(0, 400),
      qualityResult.approved ? 'positive' : 'negative',
      { legendId: plan.legendId, traceTaskId },
    );

    await this.#log.append({
      fromAgent: SEED_AGENT_IDS.qualityGate as AgentId,
      toAgent: SEED_AGENT_IDS.safetyWorker as AgentId,
      type: 'response',
      subject: qualityResult.approved ? 'Draft approved by Quality Gate' : 'Draft flagged by Quality Gate',
      content: `${qualitySummary}\n\n${qualityResult.comments}`,
      taskId: traceTaskId,
      metadata: {
        costMillicents: qualityResult.llm.costMillicents,
        provider: qualityResult.llm.providerId,
        model: qualityResult.llm.model,
        approved: qualityResult.approved,
      },
    });

    // 5. Safety Worker
    const safetyResult = await this.#safety.check({
      legendAccountId: account.id,
      promotionLevel: plan.promotionLevel,
    });
    log.info(
      { allowed: safetyResult.allowed, reason: safetyResult.reason },
      'orchestrator: safety check',
    );

    await this.#log.append({
      fromAgent: SEED_AGENT_IDS.safetyWorker as AgentId,
      toAgent: SEED_AGENT_IDS.campaignLead as AgentId,
      type: safetyResult.allowed ? 'response' : 'escalation',
      subject: safetyResult.allowed ? 'Safety check passed' : 'Safety check blocked',
      content: safetyResult.reason ?? (safetyResult.allowed ? 'all rules clear' : 'no reason given'),
      taskId: traceTaskId,
      metadata: { allowed: safetyResult.allowed },
    });

    // Safety Worker finished — either block the task or hand to Campaign Lead.
    if (!safetyResult.allowed) {
      await this.#transitionTask(
        traceTaskId,
        'blocked',
        SEED_AGENT_IDS.safetyWorker,
        SEED_AGENT_IDS.campaignLead,
      );
    } else {
      // Stay in_review; just reassign to the Lead for final decision.
      await this.#board.assign(traceTaskId, SEED_AGENT_IDS.campaignLead as AgentId).catch(() => {});
    }

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

    await this.#recordEpisode(
      SEED_AGENT_IDS.campaignLead,
      `Decided: ${leadResult.decision.decision}`,
      leadResult.decision.reasoning.slice(0, 400),
      leadResult.decision.decision === 'post'
        ? 'positive'
        : leadResult.decision.decision === 'reject'
          ? 'negative'
          : 'neutral',
      { legendId: plan.legendId, traceTaskId },
    );

    // Campaign Lead finished — map decision onto the task lifecycle.
    //   post     → approved → done (shippable)
    //   reject   → blocked  (kill with prejudice)
    //   revise   → in_progress (back to Writer)
    //   escalate → stay in_review (operator owns the next step)
    const decision = leadResult.decision.decision;
    if (decision === 'post') {
      await this.#transitionTask(traceTaskId, 'approved', SEED_AGENT_IDS.campaignLead);
      await this.#transitionTask(traceTaskId, 'done', SEED_AGENT_IDS.campaignLead);
    } else if (decision === 'reject') {
      await this.#transitionTask(traceTaskId, 'blocked', SEED_AGENT_IDS.campaignLead);
    } else if (decision === 'revise') {
      await this.#transitionTask(
        traceTaskId,
        'in_progress',
        SEED_AGENT_IDS.campaignLead,
        SEED_AGENT_IDS.contentWriter,
      );
    }
    // escalate leaves the task in_review intentionally.

    await this.#log.append({
      fromAgent: SEED_AGENT_IDS.campaignLead as AgentId,
      toAgent: SEED_AGENT_IDS.campaignLead as AgentId,
      type: leadResult.decision.decision === 'escalate' ? 'escalation' : 'notification',
      subject: `Decision: ${leadResult.decision.decision}`,
      content: leadResult.decision.reasoning,
      taskId: traceTaskId,
      metadata: {
        decision: leadResult.decision.decision,
        costMillicents: leadResult.llm?.costMillicents ?? 0,
        provider: leadResult.llm?.providerId,
        model: leadResult.llm?.model,
      },
    });

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
      traceTaskId: traceTask.id,
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
