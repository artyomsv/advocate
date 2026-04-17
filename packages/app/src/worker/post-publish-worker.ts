import { type Job, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { Redis } from 'ioredis';
import type pino from 'pino';
import { ContentPlanService } from '../content-plans/content-plan.service.js';
import type * as schema from '../db/schema.js';
import { communities, contentPlans, posts } from '../db/schema.js';
import { notifyWorkerFailure } from '../notifications/failure-alerter.js';
import type { RedditAppConfig } from '../reddit/oauth.js';
import { RedditClient } from '../reddit/client.js';
import { RedditTokenStore } from '../reddit/tokens.js';
import { type PostPublishJobData, QUEUE_NAMES } from './queues.js';

export interface PostPublishWorkerDeps {
  connection: Redis;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
  redditConfig: RedditAppConfig;
  masterKey: string;
}

/**
 * Split generated content into a Reddit post title (max 300 chars) + body.
 * Contract: the first non-empty line becomes the title; everything after the
 * first blank line is the body. If the content is one line, the body is empty.
 */
export function splitTitleAndBody(content: string): { title: string; body: string } {
  const trimmed = content.trim();
  const blankIdx = trimmed.indexOf('\n\n');
  if (blankIdx === -1) {
    return { title: trimmed.slice(0, 300), body: '' };
  }
  const rawTitle = trimmed.slice(0, blankIdx).trim();
  const body = trimmed.slice(blankIdx + 2).trim();
  return { title: rawTitle.slice(0, 300), body };
}

export function createPostPublishWorker(deps: PostPublishWorkerDeps): Worker<PostPublishJobData> {
  const log = deps.logger.child({ component: 'post-publish-worker' });
  const tokens = new RedditTokenStore(deps.db, deps.masterKey);
  const reddit = new RedditClient(deps.redditConfig, tokens);
  const service = new ContentPlanService(deps.db);

  const worker = new Worker<PostPublishJobData>(
    QUEUE_NAMES.postPublish,
    async (job: Job<PostPublishJobData>) => {
      const { contentPlanId } = job.data;
      log.info({ contentPlanId }, 'post-publish firing');

      const [plan] = await deps.db
        .select()
        .from(contentPlans)
        .where(eq(contentPlans.id, contentPlanId))
        .limit(1);
      if (!plan) throw new Error(`content_plan ${contentPlanId} not found`);
      if (plan.status !== 'approved') {
        log.warn({ contentPlanId, status: plan.status }, 'plan is not approved, skipping');
        return { skipped: true, reason: `status=${plan.status}` };
      }
      if (!plan.legendAccountId) throw new Error('plan has no legend_account_id');
      if (!plan.generatedContent) throw new Error('plan has no generated_content');

      const [community] = await deps.db
        .select()
        .from(communities)
        .where(eq(communities.id, plan.communityId))
        .limit(1);
      if (!community) throw new Error(`community ${plan.communityId} not found`);
      if (community.platform !== 'reddit') {
        throw new Error(`community platform ${community.platform} not supported by this worker`);
      }

      const { title, body } = splitTitleAndBody(plan.generatedContent);

      const submission = await reddit.submit(plan.legendAccountId, {
        subreddit: community.identifier,
        title,
        body,
      });

      await deps.db.insert(posts).values({
        contentPlanId: plan.id,
        legendAccountId: plan.legendAccountId,
        communityId: plan.communityId,
        platformPostId: submission.id,
        platformUrl: submission.url,
        content: plan.generatedContent,
        contentType: plan.contentType,
        promotionLevel: plan.promotionLevel,
        postedAt: new Date(submission.postedAt),
      });

      // Transition approved → posted. We bypass ContentPlanService.approve/reject
      // because "posted" is a forward-only non-review transition done by the
      // system, not a review decision. Use a raw update.
      await deps.db
        .update(contentPlans)
        .set({ status: 'posted' })
        .where(eq(contentPlans.id, plan.id));

      void service; // reserved for future audit logging
      log.info({ contentPlanId, platformPostId: submission.id }, 'post published');
      return { platformPostId: submission.id, url: submission.url };
    },
    { connection: deps.connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err, contentPlanId: job?.data.contentPlanId }, 'post-publish failed');
    void notifyWorkerFailure({
      worker: 'post.publish',
      jobId: job?.id,
      context: { contentPlanId: job?.data.contentPlanId },
      err,
    });
  });

  return worker;
}
