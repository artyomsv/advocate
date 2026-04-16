import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, TaskId } from '../types/ids.js';

/**
 * Role interfaces — contracts an agent fulfills. An agent can fulfill
 * multiple roles; the Runtime routes messages to role methods based on
 * task type. These are domain-agnostic by design — subclass/compose in
 * the app package for specific agent implementations.
 */

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------

export interface DecisionContext {
  question: string;
  options: readonly DecisionOption[];
  metadata?: Record<string, unknown>;
}

export interface DecisionOption {
  id: string;
  label: string;
  pros?: readonly string[];
  cons?: readonly string[];
}

export interface Decision {
  chosenOptionId: string;
  rationale: string;
  decidedAt: IsoTimestamp;
}

export interface EscalationRequest {
  subject: string;
  details: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  options?: readonly DecisionOption[];
}

export interface HumanResponse {
  approved: boolean;
  chosenOptionId?: string;
  feedback?: string;
  respondedAt: IsoTimestamp;
}

export interface ReviewResult {
  approved: boolean;
  reviewerAgentId: AgentId;
  comments: string;
  reviewedAt: IsoTimestamp;
}

export interface LeaderRole {
  makeDecision(context: DecisionContext): Promise<Decision>;
  delegateTask(taskId: TaskId, toAgentId: AgentId): Promise<void>;
  escalateToHuman(request: EscalationRequest): Promise<HumanResponse>;
  reviewWork(taskId: TaskId): Promise<ReviewResult>;
}

// ---------------------------------------------------------------------------
// Content Creator
// ---------------------------------------------------------------------------

export interface ContentBrief {
  title: string;
  instructions: string;
  promotionLevel: number; // 0–10
  context?: Record<string, unknown>;
}

export interface ContentDraft {
  body: string;
  generatedBy: AgentId;
  generatedAt: IsoTimestamp;
  /** Free-form metadata — e.g. prompt tokens used, model selected. */
  metadata?: Record<string, unknown>;
}

export interface ContentCreatorRole {
  generateDraft(brief: ContentBrief): Promise<ContentDraft>;
  reviseDraft(draft: ContentDraft, feedback: string): Promise<ContentDraft>;
}

// ---------------------------------------------------------------------------
// Reviewer
// ---------------------------------------------------------------------------

export interface QualityScore {
  authenticity: number; // 1–10
  value: number; // 1–10
  promotionalSmell: number; // 1–10, lower = better
  personaConsistency: number; // 1–10
  communityFit: number; // 1–10
}

export interface ReviewerRole {
  review(draft: ContentDraft): Promise<ContentReview>;
}

export interface ContentReview {
  approved: boolean;
  score: QualityScore;
  comments: string;
  reviewedBy: AgentId;
  reviewedAt: IsoTimestamp;
}

// ---------------------------------------------------------------------------
// Scout
// ---------------------------------------------------------------------------

export interface DiscoveryCriteria {
  keywords: readonly string[];
  platforms?: readonly string[];
  minRelevance?: number;
  limit?: number;
}

export interface DiscoveryResult {
  platform: string;
  identifier: string;
  name: string;
  url?: string;
  relevanceScore: number;
  notes?: string;
}

export interface MonitorTarget {
  platform: string;
  identifier: string;
  pattern?: string;
}

export interface MonitorEvent {
  target: MonitorTarget;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: IsoTimestamp;
}

export interface ScoutRole {
  discover(criteria: DiscoveryCriteria): Promise<readonly DiscoveryResult[]>;
  monitor(targets: readonly MonitorTarget[]): Promise<readonly MonitorEvent[]>;
}

// ---------------------------------------------------------------------------
// Analyst
// ---------------------------------------------------------------------------

export interface AnalysisInput {
  periodFrom: IsoTimestamp;
  periodTo: IsoTimestamp;
  metrics?: Record<string, unknown>;
}

export interface AnalysisReport {
  summary: string;
  findings: readonly string[];
  recommendationsHint?: readonly string[];
  producedBy: AgentId;
  producedAt: IsoTimestamp;
}

export interface Recommendation {
  title: string;
  rationale: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
}

export interface AnalystRole {
  analyze(input: AnalysisInput): Promise<AnalysisReport>;
  recommend(report: AnalysisReport): Promise<readonly Recommendation[]>;
}
