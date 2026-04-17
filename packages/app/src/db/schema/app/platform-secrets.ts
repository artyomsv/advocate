import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Encrypted KV store for app-level secrets managed from the Settings page.
 * Values are AES-256-GCM encrypted with CREDENTIAL_MASTER_KEY (env var).
 * The same key encrypts legend_credentials.
 *
 * Example rows:
 *   category='reddit', key='REDDIT_CLIENT_ID',  encrypted_payload='…'
 *   category='llm',    key='ANTHROPIC_API_KEY', encrypted_payload='…'
 */
export const platformSecrets = pgTable(
  'platform_secrets',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    category: text('category').notNull(),
    key: text('key').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniqueCategoryKey: uniqueIndex('platform_secrets_category_key_unique').on(t.category, t.key),
    categoryIdx: index('platform_secrets_category_idx').on(t.category),
  }),
);

export type PlatformSecret = typeof platformSecrets.$inferSelect;
export type NewPlatformSecret = typeof platformSecrets.$inferInsert;
