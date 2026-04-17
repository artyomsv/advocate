import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { communityStatusEnum } from './enums.js';

/**
 * Communities discovered by Scout. Scored on relevance/activity/receptiveness/
 * moderation risk. Unique composite key (platform, identifier) prevents
 * duplicate discovery.
 */
export const communities = pgTable(
  'communities',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    platform: varchar('platform', { length: 50 }).notNull(),
    identifier: varchar('identifier', { length: 500 }).notNull(),
    name: varchar('name', { length: 500 }).notNull(),
    url: text('url'),
    subscriberCount: integer('subscriber_count'),
    postsPerDay: numeric('posts_per_day', { precision: 8, scale: 2 }),
    relevanceScore: numeric('relevance_score', { precision: 3, scale: 1 }),
    activityScore: numeric('activity_score', { precision: 3, scale: 1 }),
    receptivenessScore: numeric('receptiveness_score', { precision: 3, scale: 1 }),
    moderationRisk: numeric('moderation_risk', { precision: 3, scale: 1 }),
    cultureSummary: text('culture_summary'),
    rulesSummary: text('rules_summary'),
    bestPostingTimes: jsonb('best_posting_times'),
    topContributors: jsonb('top_contributors').$type<string[]>(),
    lastScannedAt: timestamp('last_scanned_at', { withTimezone: true }),
    status: communityStatusEnum('status').notNull().default('discovered'),
    notes: text('notes'),
    /** Platform-native flair ID (Reddit link_flair_template_id). Optional. */
    defaultFlairId: varchar('default_flair_id', { length: 200 }),
    /** Human-readable flair text for the UI; sent as flair_text on submit. */
    defaultFlairText: varchar('default_flair_text', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    platformIdentifierIdx: uniqueIndex('communities_platform_identifier_unique').on(
      t.platform,
      t.identifier,
    ),
    platformStatusIdx: index('communities_platform_status_idx').on(t.platform, t.status),
    relevanceIdx: index('communities_relevance_idx').on(t.relevanceScore),
  }),
);

export type Community = typeof communities.$inferSelect;
export type NewCommunity = typeof communities.$inferInsert;
