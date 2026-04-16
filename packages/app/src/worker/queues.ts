/**
 * Queue names shared between the API (which enqueues) and the worker
 * (which consumes). Keep in sync with packages/app/src/worker/worker.ts.
 */
export const QUEUE_NAMES = {
  orchestrate: 'orchestrate',
} as const;

/**
 * Job data shape for the `orchestrate` queue.
 * Same shape as DraftOrchestrationInput in orchestrator/types.ts, kept
 * here so worker code doesn't have to import orchestrator-specific types
 * at the queue layer.
 */
export interface OrchestrateJobData {
  productId: string;
  campaignGoal: string;
  legendIds?: readonly string[];
  communityIds?: readonly string[];
  threadContext?: string;
  /** Optional label so logs/traces can correlate recurring runs. */
  scheduleName?: string;
}
