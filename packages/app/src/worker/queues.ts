/**
 * Queue names shared between the API (which enqueues) and the worker
 * (which consumes). Keep in sync with packages/app/src/worker/worker.ts.
 */
export const QUEUE_NAMES = {
  orchestrate: 'orchestrate',
  postPublish: 'post.publish',
  scoutScan: 'scout.scan',
  analyticsFetch: 'analytics.fetch',
  analyticsAnalyze: 'analytics.analyze',
  dailySummary: 'telegram.daily-summary',
} as const;

export interface OrchestrateJobData {
  productId: string;
  campaignGoal: string;
  legendIds?: readonly string[];
  communityIds?: readonly string[];
  threadContext?: string;
  scheduleName?: string;
}

export interface PostPublishJobData {
  contentPlanId: string;
}

export interface ScoutScanJobData {
  productId: string;
  communityId: string;
  threshold?: number;
  fetchLimit?: number;
  campaignGoal?: string;
}

export interface AnalyticsFetchJobData {
  /** Empty body — sweep is global; Reddit accounts are discovered per-run. */
  _sentinel?: true;
}

export interface AnalyticsAnalyzeJobData {
  productId: string;
  lookbackDays?: number;
}

export interface DailySummaryJobData {
  /** Empty body — summary covers all active products at fire time. */
  _sentinel?: true;
}
