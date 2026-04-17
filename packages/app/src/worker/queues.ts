/**
 * Queue names shared between the API (which enqueues) and the worker
 * (which consumes). Keep in sync with packages/app/src/worker/worker.ts.
 */
export const QUEUE_NAMES = {
  orchestrate: 'orchestrate',
  postPublish: 'post.publish',
  scoutScan: 'scout.scan',
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
