import type { IsoTimestamp } from '../types/common.js';

/**
 * Input shape for an LLM call. The three-layer prompt architecture
 * flattens into a single (systemPrompt, userPrompt) pair at this layer —
 * composition of soul + product knowledge + context is an app-level concern.
 */
export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  /** 0.0–2.0. Provider may clamp. */
  temperature?: number;
  maxTokens?: number;
  /** Request structured JSON output when the provider supports it. */
  responseFormat?: 'text' | 'json';
}

/**
 * Result of an LLM call. `costMillicents` uses millicents (1/100,000 USD)
 * so per-token precision survives aggregation.
 */
export interface LlmResponse {
  content: string;
  usage: LlmTokenUsage;
  costMillicents: number;
  providerId: string;
  model: string;
  latencyMs: number;
}

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cached input tokens (Anthropic prompt caching). Absent or 0 when unused. */
  cachedTokens?: number;
}

/**
 * Estimated min/max cost of a call before it is dispatched.
 * The router uses the `maxMillicents` value for pre-dispatch budget checks.
 */
export interface CostEstimate {
  minMillicents: number;
  maxMillicents: number;
}

/**
 * Recorded call for budget / analytics.
 */
export interface LlmUsageRecord {
  providerId: string;
  model: string;
  taskType: string;
  usage: LlmTokenUsage;
  costMillicents: number;
  latencyMs: number;
  occurredAt: IsoTimestamp;
  /** Quality score (1-10) attached retroactively by the Quality Gate. Optional. */
  qualityScore?: number;
}

/**
 * Snapshot of current budget state, exposed for dashboards + decisions.
 */
export interface BudgetStatus {
  monthlyCapCents: number;
  spentCents: number;
  remainingCents: number;
  /** Linear extrapolation: spent / days-elapsed × days-in-month. */
  projectedMonthEndCents: number;
}

/**
 * Thrown when the router cannot satisfy a call without exceeding budget
 * AND no budget-tier fallback is allowed (e.g. sensitive task in budget
 * mode when the sensitive list blocks budget-tier providers).
 */
export class BudgetExhaustedError extends Error {
  constructor(public readonly status: BudgetStatus) {
    super(
      `LLM monthly budget exhausted: spent ${status.spentCents}¢ of ${status.monthlyCapCents}¢`,
    );
    this.name = 'BudgetExhaustedError';
  }
}
