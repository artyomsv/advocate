import { eq } from 'drizzle-orm';
import { legendAccounts } from '../db/schema.js';
import { BaseAgent } from './base-agent.js';
import type { AgentDeps } from './types.js';

export interface SafetyWorkerLimits {
  /** Max posts per day per account. */
  maxPostsPerDay: number;
  /** Max posts per week per account. */
  maxPostsPerWeek: number;
  /** Minimum gap (ms) since the last post on this account. */
  minGapBetweenPostsMs: number;
  /** Minimum cool-down (ms) since the last PRODUCT MENTION before another one is allowed. */
  minGapBetweenProductMentionsMs: number;
  /** promotionLevel >= this value is considered a product mention. */
  productMentionThreshold: number;
}

const DEFAULT_LIMITS: SafetyWorkerLimits = {
  maxPostsPerDay: 3,
  maxPostsPerWeek: 15,
  minGapBetweenPostsMs: 2 * 60 * 60 * 1000, // 2 hours
  minGapBetweenProductMentionsMs: 3 * 24 * 60 * 60 * 1000, // 3 days
  productMentionThreshold: 4,
};

export interface SafetyCheckInput {
  legendAccountId: string;
  /** 0–10 per the promotion gradient. */
  promotionLevel: number;
}

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
  /** When the blocking condition is expected to clear (e.g. gap elapsed). */
  nextPossibleAt?: Date;
}

/**
 * Rules-based gate. No LLM calls. Reads the account row and evaluates limits.
 */
export class SafetyWorker extends BaseAgent {
  readonly name = 'safety-worker';
  readonly #limits: SafetyWorkerLimits;

  constructor(deps: AgentDeps, limits: Partial<SafetyWorkerLimits> = {}) {
    super(deps);
    this.#limits = { ...DEFAULT_LIMITS, ...limits };
  }

  async check(input: SafetyCheckInput): Promise<SafetyCheckResult> {
    const [account] = await this.deps.db
      .select()
      .from(legendAccounts)
      .where(eq(legendAccounts.id, input.legendAccountId))
      .limit(1);

    if (!account) {
      throw new Error(`Legend account ${input.legendAccountId} not found`);
    }

    // Account status gate — only `active` + `warming_up` can post.
    if (account.status !== 'active' && account.status !== 'warming_up') {
      return {
        allowed: false,
        reason: `Account status is ${account.status}; posting blocked`,
      };
    }

    // Daily posts cap
    if (account.postsToday >= this.#limits.maxPostsPerDay) {
      return {
        allowed: false,
        reason: `Daily post cap reached (${account.postsToday}/${this.#limits.maxPostsPerDay} posts today)`,
      };
    }

    // Weekly posts cap
    if (account.postsThisWeek >= this.#limits.maxPostsPerWeek) {
      return {
        allowed: false,
        reason: `Weekly post cap reached (${account.postsThisWeek}/${this.#limits.maxPostsPerWeek} posts this week)`,
      };
    }

    // Minimum gap since last post
    if (account.lastPostAt) {
      const elapsed = Date.now() - account.lastPostAt.getTime();
      if (elapsed < this.#limits.minGapBetweenPostsMs) {
        const nextPossibleAt = new Date(
          account.lastPostAt.getTime() + this.#limits.minGapBetweenPostsMs,
        );
        const elapsedMin = Math.round(elapsed / 60000);
        const requiredMin = Math.round(this.#limits.minGapBetweenPostsMs / 60000);
        return {
          allowed: false,
          reason: `Gap too soon since last post (${elapsedMin} min elapsed, ${requiredMin} min required)`,
          nextPossibleAt,
        };
      }
    }

    // Product-mention cool-down
    if (
      input.promotionLevel >= this.#limits.productMentionThreshold &&
      account.lastProductMentionAt
    ) {
      const elapsed = Date.now() - account.lastProductMentionAt.getTime();
      if (elapsed < this.#limits.minGapBetweenProductMentionsMs) {
        const nextPossibleAt = new Date(
          account.lastProductMentionAt.getTime() + this.#limits.minGapBetweenProductMentionsMs,
        );
        const elapsedH = Math.round(elapsed / 3600000);
        const requiredH = Math.round(this.#limits.minGapBetweenProductMentionsMs / 3600000);
        return {
          allowed: false,
          reason: `Product mention cool-down not elapsed (${elapsedH}h since last mention, ${requiredH}h required)`,
          nextPossibleAt,
        };
      }
    }

    return { allowed: true };
  }
}
