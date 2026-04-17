import { and, gt, inArray, isNull, lt, or } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { childLogger } from '../config/logger.js';
import type * as schema from '../db/schema.js';
import { postMetricsHistory, posts } from '../db/schema.js';
import type { RedditClient } from '../reddit/client.js';

const log = childLogger('metrics-fetcher');

export interface MetricsSweepResult {
  fetched: number;
  updated: number;
  perAccount: Record<string, number>;
}

/**
 * Selects recent posts that haven't been refreshed in an hour, groups them
 * by legend_account_id (one OAuth per account), batch-fetches current
 * engagement via Reddit's /api/info, updates the posts row, and appends
 * a post_metrics_history snapshot.
 */
export class MetricsFetcher {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly reddit: RedditClient,
  ) {}

  async sweep(): Promise<MetricsSweepResult> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const rows = await this.db
      .select({
        id: posts.id,
        legendAccountId: posts.legendAccountId,
        platformPostId: posts.platformPostId,
      })
      .from(posts)
      .where(
        and(
          gt(posts.postedAt, thirtyDaysAgo),
          or(isNull(posts.lastMetricsUpdate), lt(posts.lastMetricsUpdate, oneHourAgo)),
        ),
      )
      .limit(200);

    if (rows.length === 0) return { fetched: 0, updated: 0, perAccount: {} };

    // Group by account, skip rows missing a platform id (shouldn't happen post-Plan 21 but defensive).
    const byAccount = new Map<string, Array<{ id: string; fullname: string }>>();
    for (const r of rows) {
      if (!r.platformPostId) continue;
      const arr = byAccount.get(r.legendAccountId) ?? [];
      arr.push({ id: r.id, fullname: r.platformPostId });
      byAccount.set(r.legendAccountId, arr);
    }

    let fetched = 0;
    let updated = 0;
    const perAccount: Record<string, number> = {};

    for (const [legendAccountId, items] of byAccount) {
      try {
        const things = await this.reddit.fetchThings(
          legendAccountId,
          items.map((i) => i.fullname),
        );
        fetched += things.length;
        const byFullname = new Map(things.map((t) => [t.fullname, t]));

        for (const item of items) {
          const t = byFullname.get(item.fullname);
          if (!t) {
            // Reddit returns nothing for fullnames that 404 (post deleted by
            // author or removed by mods with no visibility). Treat as removal
            // but only flip once — avoid overwriting a more specific category.
            await this.db
              .update(posts)
              .set({
                wasRemoved: true,
                moderatorAction: 'vanished (404 from /api/info)',
                lastMetricsUpdate: new Date(),
              })
              .where(inArray(posts.id, [item.id]));
            continue;
          }
          await this.db
            .update(posts)
            .set({
              upvotes: t.score,
              downvotes: 0,
              repliesCount: t.numComments,
              wasRemoved: t.isRemoved,
              moderatorAction: t.removedByCategory,
              lastMetricsUpdate: new Date(),
            })
            .where(inArray(posts.id, [item.id]));
          await this.db.insert(postMetricsHistory).values({
            postId: item.id,
            measuredAt: new Date(),
            upvotes: t.score,
            downvotes: 0,
            repliesCount: t.numComments,
            views: 0,
          });
          updated++;
        }
        perAccount[legendAccountId] = things.length;
      } catch (err) {
        log.warn({ legendAccountId, err }, 'sweep account failed, skipping');
        perAccount[legendAccountId] = 0;
      }
    }
    log.info({ fetched, updated }, 'metrics sweep complete');
    return { fetched, updated, perAccount };
  }
}
