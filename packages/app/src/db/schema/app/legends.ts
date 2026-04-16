import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { agents } from '../engine/agents.js';
import {
  accountStatusEnum,
  emailProviderEnum,
  emailStatusEnum,
  legendMaturityEnum,
  warmUpPhaseEnum,
} from './enums.js';
import { products } from './products.js';

/**
 * Full actor identity — Legend. The owner hand-crafts these through the
 * dashboard; the system does not auto-generate them. Shape fields (bigFive,
 * typingStyle, productRelationship) are jsonb for schema flexibility.
 */
export const legends = pgTable(
  'legends',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id').references(() => agents.id, { onDelete: 'set null' }),
    firstName: varchar('first_name', { length: 100 }).notNull(),
    lastName: varchar('last_name', { length: 100 }).notNull(),
    gender: varchar('gender', { length: 20 }).notNull(),
    age: integer('age').notNull(),
    location: jsonb('location').notNull(),
    lifeDetails: jsonb('life_details').notNull(),
    professional: jsonb('professional').notNull(),
    bigFive: jsonb('big_five').notNull(),
    techSavviness: integer('tech_savviness').notNull(),
    typingStyle: jsonb('typing_style').notNull(),
    activeHours: jsonb('active_hours').notNull(),
    activeDays: jsonb('active_days').notNull().$type<number[]>(),
    averagePostLength: varchar('average_post_length', { length: 20 }).notNull(),
    hobbies: jsonb('hobbies').notNull().$type<string[]>(),
    otherInterests: jsonb('other_interests'),
    expertiseAreas: jsonb('expertise_areas').notNull().$type<string[]>(),
    knowledgeGaps: jsonb('knowledge_gaps').notNull().$type<string[]>(),
    productRelationship: jsonb('product_relationship').notNull(),
    opinions: jsonb('opinions').notNull(),
    neverDo: jsonb('never_do').notNull().$type<string[]>(),
    maturity: legendMaturityEnum('maturity').notNull().default('lurking'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    productIdx: index('legends_product_idx').on(t.productId),
    agentIdx: index('legends_agent_idx').on(t.agentId),
  }),
);

/**
 * Platform registrations per legend. One row per (legend, platform) pair.
 */
export const legendAccounts = pgTable(
  'legend_accounts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    legendId: uuid('legend_id')
      .notNull()
      .references(() => legends.id, { onDelete: 'cascade' }),
    platform: varchar('platform', { length: 50 }).notNull(),
    username: varchar('username', { length: 200 }).notNull(),
    email: varchar('email', { length: 200 }),
    registeredAt: timestamp('registered_at', { withTimezone: true }),
    status: accountStatusEnum('status').notNull().default('warming_up'),
    karma: integer('karma'),
    followers: integer('followers'),
    postsCount: integer('posts_count'),
    warmUpPhase: warmUpPhaseEnum('warm_up_phase').notNull().default('lurking'),
    warmUpStartedAt: timestamp('warm_up_started_at', { withTimezone: true }),
    warmUpCompletedAt: timestamp('warm_up_completed_at', { withTimezone: true }),
    postsToday: integer('posts_today').notNull().default(0),
    postsThisWeek: integer('posts_this_week').notNull().default(0),
    lastPostAt: timestamp('last_post_at', { withTimezone: true }),
    lastProductMentionAt: timestamp('last_product_mention_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    legendIdx: index('legend_accounts_legend_idx').on(t.legendId),
    platformIdx: index('legend_accounts_platform_idx').on(t.platform),
    statusIdx: index('legend_accounts_status_idx').on(t.status),
  }),
);

/**
 * Legend email accounts. Sensitive fields stored as AES-256-GCM ciphertext
 * (see packages/app/src/credentials/cipher.ts for encrypt/decrypt).
 */
export const legendEmailAccounts = pgTable(
  'legend_email_accounts',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    legendId: uuid('legend_id')
      .notNull()
      .references(() => legends.id, { onDelete: 'cascade' }),
    provider: emailProviderEnum('provider').notNull(),
    address: varchar('address', { length: 200 }).notNull().unique(),
    passwordCiphertext: text('password_ciphertext').notNull(),
    recoveryPhoneCiphertext: text('recovery_phone_ciphertext'),
    recoveryEmailCiphertext: text('recovery_email_ciphertext'),
    status: emailStatusEnum('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    legendIdx: index('legend_email_accounts_legend_idx').on(t.legendId),
  }),
);

/**
 * Encrypted credentials for platform APIs (OAuth tokens, session cookies).
 */
export const legendCredentials = pgTable(
  'legend_credentials',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    legendAccountId: uuid('legend_account_id')
      .notNull()
      .references(() => legendAccounts.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 50 }).notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    metadata: jsonb('metadata'),
    revoked: boolean('revoked').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    rotatedAt: timestamp('rotated_at', { withTimezone: true }),
  },
  (t) => ({
    accountIdx: index('legend_credentials_account_idx').on(t.legendAccountId),
  }),
);

export type Legend = typeof legends.$inferSelect;
export type NewLegend = typeof legends.$inferInsert;
export type LegendAccount = typeof legendAccounts.$inferSelect;
export type NewLegendAccount = typeof legendAccounts.$inferInsert;
export type LegendEmailAccount = typeof legendEmailAccounts.$inferSelect;
export type NewLegendEmailAccount = typeof legendEmailAccounts.$inferInsert;
export type LegendCredential = typeof legendCredentials.$inferSelect;
export type NewLegendCredential = typeof legendCredentials.$inferInsert;
