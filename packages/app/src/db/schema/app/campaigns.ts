import { sql } from 'drizzle-orm';
import {
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { agentTasks } from '../engine/tasks.js';
import { communities } from './communities.js';
import { campaignStatusEnum, contentPlanStatusEnum, contentTypeEnum } from './enums.js';
import { legendAccounts, legends } from './legends.js';
import { products } from './products.js';

/**
 * Campaign — coordinated content across personas/communities toward an
 * objective. Selects legends/communities via jsonb ID arrays (avoids heavy
 * junction tables given low typical cardinality: 2-6 legends, 5-20 communities).
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 300 }).notNull(),
    description: text('description'),
    strategy: text('strategy'),
    legendIds: jsonb('legend_ids').notNull().$type<string[]>(),
    communityIds: jsonb('community_ids').notNull().$type<string[]>(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: campaignStatusEnum('status').notNull().default('planned'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index('campaigns_product_idx').on(t.productId),
    statusIdx: index('campaigns_status_idx').on(t.status),
  }),
);

/**
 * What a specific legend will post in a specific community at a specific time.
 * Lifecycle: planned → generating → review → approved → posted (or rejected/failed).
 * `promotionLevel` is 0-10 per the promotion gradient.
 */
export const contentPlans = pgTable(
  'content_plans',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
    legendId: uuid('legend_id')
      .notNull()
      .references(() => legends.id, { onDelete: 'cascade' }),
    legendAccountId: uuid('legend_account_id').references(() => legendAccounts.id, {
      onDelete: 'set null',
    }),
    communityId: uuid('community_id')
      .notNull()
      .references(() => communities.id),
    contentType: contentTypeEnum('content_type').notNull(),
    promotionLevel: smallint('promotion_level').notNull().default(0),
    threadUrl: text('thread_url'),
    threadContext: text('thread_context'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }).notNull(),
    status: contentPlanStatusEnum('status').notNull().default('planned'),
    generatedContent: text('generated_content'),
    qualityScore: jsonb('quality_score'),
    reviewedBy: varchar('reviewed_by', { length: 200 }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    traceTaskId: uuid('trace_task_id').references(() => agentTasks.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    campaignIdx: index('content_plans_campaign_idx').on(t.campaignId),
    legendIdx: index('content_plans_legend_idx').on(t.legendId),
    statusIdx: index('content_plans_status_idx').on(t.status),
    scheduledApprovedIdx: index('content_plans_scheduled_approved_idx').on(t.scheduledAt, t.status),
    traceTaskIdx: index('content_plans_trace_task_idx').on(t.traceTaskId),
  }),
);

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type ContentPlan = typeof contentPlans.$inferSelect;
export type NewContentPlan = typeof contentPlans.$inferInsert;
