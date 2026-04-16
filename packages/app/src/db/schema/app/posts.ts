import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { contentPlans } from './campaigns.js';
import { communities } from './communities.js';
import { contentTypeEnum } from './enums.js';
import { legendAccounts } from './legends.js';

/**
 * Posts that landed on a platform. One-to-one with an approved content_plan.
 * platformPostId is the platform-native ID (Reddit submission, Tweet ID, etc.).
 */
export const posts = pgTable(
  'posts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    contentPlanId: uuid('content_plan_id').references(() => contentPlans.id, {
      onDelete: 'set null',
    }),
    legendAccountId: uuid('legend_account_id')
      .notNull()
      .references(() => legendAccounts.id, { onDelete: 'cascade' }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id),
    platformPostId: varchar('platform_post_id', { length: 500 }),
    platformUrl: text('platform_url'),
    content: text('content').notNull(),
    contentType: contentTypeEnum('content_type').notNull(),
    promotionLevel: smallint('promotion_level').notNull().default(0),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    upvotes: integer('upvotes').notNull().default(0),
    downvotes: integer('downvotes').notNull().default(0),
    repliesCount: integer('replies_count').notNull().default(0),
    views: integer('views').notNull().default(0),
    wasRemoved: boolean('was_removed').notNull().default(false),
    moderatorAction: text('moderator_action'),
    lastMetricsUpdate: timestamp('last_metrics_update', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    accountIdx: index('posts_account_posted_idx').on(t.legendAccountId, t.postedAt),
    communityIdx: index('posts_community_posted_idx').on(t.communityId, t.postedAt),
    contentPlanIdx: index('posts_content_plan_idx').on(t.contentPlanId),
  }),
);

/**
 * Time-series snapshots of post engagement. Written by Analytics worker at
 * 1h / 6h / 24h / 7d intervals so trends can be graphed.
 */
export const postMetricsHistory = pgTable(
  'post_metrics_history',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    postId: uuid('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    upvotes: integer('upvotes').notNull(),
    downvotes: integer('downvotes').notNull(),
    repliesCount: integer('replies_count').notNull(),
    views: integer('views').notNull(),
  },
  (t) => ({
    postMeasuredIdx: index('post_metrics_history_post_measured_idx').on(t.postId, t.measuredAt),
  }),
);

export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
export type PostMetricsHistory = typeof postMetricsHistory.$inferSelect;
export type NewPostMetricsHistory = typeof postMetricsHistory.$inferInsert;
