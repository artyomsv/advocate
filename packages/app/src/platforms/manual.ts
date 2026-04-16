import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { communities, posts } from '../db/schema.js';
import type { CreatePostParams, PlatformAdapter, PlatformPostResult } from './types.js';

/**
 * Manual posting flow: we generate the content + persist the post row, then
 * hand the human instructions to copy-paste into the target platform. After
 * they actually post, `recordManualPost` fills in the platform ids.
 */
export class ManualAdapter implements PlatformAdapter {
  readonly platform = 'manual';

  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async createPost(params: CreatePostParams): Promise<PlatformPostResult> {
    // Fetch community name for the instruction text — non-fatal if missing.
    const [community] = await this.db
      .select()
      .from(communities)
      .where(eq(communities.id, params.communityId))
      .limit(1);

    const communityLabel = community?.name ?? 'target community';
    const platformLabel = community?.platform ?? 'the platform';

    const [row] = await this.db
      .insert(posts)
      .values({
        contentPlanId: params.contentPlanId,
        legendAccountId: params.legendAccountId,
        communityId: params.communityId,
        platformPostId: null,
        platformUrl: null,
        content: params.content,
        contentType: params.contentType as
          | 'helpful_comment'
          | 'value_post'
          | 'problem_question'
          | 'comparison_question'
          | 'experience_share'
          | 'recommendation'
          | 'launch_post',
        promotionLevel: params.promotionLevel,
        postedAt: null,
      })
      .returning();

    if (!row) {
      throw new Error('insert returned no row');
    }

    const instructions = [
      `Copy the content below.`,
      `Open ${platformLabel} and navigate to ${communityLabel}.`,
      params.parentPlatformId
        ? `Reply to: ${params.parentPlatformId}.`
        : `Create a new post${params.title ? ` titled "${params.title}"` : ''}.`,
      `Paste the content and submit.`,
      `Then confirm the URL via POST /posts/${row.id}/confirm (see dashboard).`,
      '',
      '--- CONTENT ---',
      params.content,
      '--- END CONTENT ---',
    ].join('\n');

    return {
      postId: row.id,
      platformPostId: null,
      platformUrl: null,
      status: 'pending_manual_post',
      instructions,
    };
  }

  async recordManualPost(
    postId: string,
    platformPostId: string,
    platformUrl: string,
  ): Promise<void> {
    const [existing] = await this.db.select().from(posts).where(eq(posts.id, postId)).limit(1);
    if (!existing) {
      throw new Error(`Post ${postId} not found`);
    }

    // Idempotent: if already set with the same values, no update needed.
    if (existing.platformPostId === platformPostId && existing.platformUrl === platformUrl) {
      return;
    }

    await this.db
      .update(posts)
      .set({
        platformPostId,
        platformUrl,
        postedAt: existing.postedAt ?? new Date(),
      })
      .where(eq(posts.id, postId));
  }
}
