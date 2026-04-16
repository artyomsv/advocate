import type { CampaignLeadDecision } from '../agents/campaign-lead.js';
import type { QualityGateResult } from '../agents/quality-gate.js';
import type { SafetyCheckResult } from '../agents/safety-worker.js';
import type { StrategistPlan } from '../agents/strategist.js';
import type { ContentPlan } from '../db/schema.js';

export interface DraftOrchestrationInput {
  productId: string;
  /** Optional: narrow the Strategist's legend pool to specific ids. */
  legendIds?: readonly string[];
  /** Optional: narrow the Strategist's community pool to specific ids. */
  communityIds?: readonly string[];
  campaignGoal: string;
  /** Optional: specific thread context the Strategist should consider. */
  threadContext?: string;
}

export interface DraftOrchestrationResult {
  /** The persisted content_plan row. */
  contentPlan: ContentPlan;
  /** Everything each agent returned, for debugging / dashboard. */
  trace: {
    strategistPlan: StrategistPlan;
    draftContent: string;
    quality: QualityGateResult;
    safety: SafetyCheckResult;
    decision: CampaignLeadDecision;
  };
  /** Total cost across all LLM calls, millicents. */
  totalCostMillicents: number;
}

export class OrchestratorNoLegendsError extends Error {
  constructor(productId: string) {
    super(`No legends available for product ${productId}`);
    this.name = 'OrchestratorNoLegendsError';
  }
}

export class OrchestratorNoCommunitiesError extends Error {
  constructor() {
    super('No communities available for orchestration');
    this.name = 'OrchestratorNoCommunitiesError';
  }
}

export class OrchestratorNoAccountError extends Error {
  constructor(legendId: string, platform: string) {
    super(`Legend ${legendId} has no account on platform ${platform}`);
    this.name = 'OrchestratorNoAccountError';
  }
}
