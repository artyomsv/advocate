# Plan 19 — Settings page + platform secret store

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Encrypted KV store for app-level secrets (Reddit OAuth app creds, LLM API keys, Telegram bot token) + a Settings page in the dashboard with category tabs and masked inputs. Plan 20's OAuth flow + Plans 21-23 all consume this store. Tag `plan19-complete`.

**Prerequisites:** Plan 18 complete. `CREDENTIAL_MASTER_KEY` already set (Plan 08.5).

---

## Architecture

- **Table:** `platform_secrets (id uuid pk, category text, key text, encrypted_payload text, created_at, updated_at, unique(category, key))`.
- **Cipher:** reuse `packages/app/src/credentials/cipher.ts` (AES-256-GCM, master key from env).
- **Service:** `SecretsService` with `get(category, key)`, `set(category, key, plaintext)`, `list(category)` (returns masked), `delete(category, key)`.
- **Env fallback:** `resolveSecret(key)` returns the DB value if set, else `process.env[key]`. Existing `.env`-based code (`getEnv().GOOGLE_AI_API_KEY` etc.) keeps working; we don't modify those consumers in this plan — the existing ones remain env-only for now. Plan 20+ consumers use `resolveSecret` for things that can be DB-managed.
- **Masking:** `GET` responses show `"••••••••" + last 2 chars` for anything over 4 chars, `"••••"` for shorter.

---

## Task 1 — Schema + migration

**Files:**
- `packages/app/src/db/schema/app/platform-secrets.ts` (new)
- `packages/app/src/db/schema/app/index.ts` (export)
- `packages/app/src/db/schema.ts` (re-export is automatic via glob)
- Migration: `pnpm --filter @mynah/app db:generate` then `db:migrate`

Schema:

```typescript
import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
    uniqueCategoryKey: sql`UNIQUE (${t.category}, ${t.key})`,
    categoryIdx: index('platform_secrets_category_idx').on(t.category),
  }),
);

export type PlatformSecret = typeof platformSecrets.$inferSelect;
export type NewPlatformSecret = typeof platformSecrets.$inferInsert;
```

**Note:** the `UNIQUE` constraint syntax via `sql` template is Drizzle-specific — check `drizzle-orm` version. If that form doesn't work, use `uniqueIndex('platform_secrets_category_key_idx').on(t.category, t.key)` instead.

**Run:**

```bash
pnpm --filter @mynah/app db:generate
# review the generated migration, then:
pnpm --filter @mynah/app db:migrate  # (via Docker stack or local connection)
```

**Commit:**
```bash
git add packages/app/src/db/schema packages/app/drizzle/migrations
git commit -m "feat(db): platform_secrets table for encrypted app-level credentials"
```

---

## Task 2 — SecretsService + routes

**Files:**
- `packages/app/src/secrets/secrets.service.ts` (new)
- `packages/app/src/secrets/categories.ts` (new — enum of known categories + keys)
- `packages/app/src/server/routes/secrets.ts` (new)
- `packages/app/src/server/server.ts` (register)
- `packages/app/tests/secrets/secrets.service.test.ts` (new — integration)

### Categories

```typescript
// packages/app/src/secrets/categories.ts
export const SECRET_CATEGORIES = {
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET', 'REDDIT_REDIRECT_URI', 'REDDIT_USER_AGENT'],
  llm: ['ANTHROPIC_API_KEY', 'GOOGLE_AI_API_KEY', 'OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'QWEN_API_KEY'],
  telegram: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHANNEL_ID'],
} as const;

export type SecretCategory = keyof typeof SECRET_CATEGORIES;
export type SecretKey<C extends SecretCategory> = (typeof SECRET_CATEGORIES)[C][number];
```

### Service

```typescript
// packages/app/src/secrets/secrets.service.ts
import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getEnv } from '../config/env.js';
import { decrypt, encrypt } from '../credentials/cipher.js';
import type * as schema from '../db/schema.js';
import { platformSecrets } from '../db/schema.js';
import { SECRET_CATEGORIES, type SecretCategory } from './categories.js';

export interface MaskedSecret {
  category: SecretCategory;
  key: string;
  masked: string;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

function mask(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-2)}`;
}

export class SecretsService {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  /** Returns plaintext from DB, else env, else null. */
  async resolve(category: SecretCategory, key: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(platformSecrets)
      .where(and(eq(platformSecrets.category, category), eq(platformSecrets.key, key)))
      .limit(1);
    if (row) {
      return decrypt(row.encryptedPayload, getEnv().CREDENTIAL_MASTER_KEY);
    }
    const envValue = process.env[key];
    return envValue && envValue.length > 0 ? envValue : null;
  }

  async list(category: SecretCategory): Promise<MaskedSecret[]> {
    const knownKeys = SECRET_CATEGORIES[category] as readonly string[];
    const rows = await this.db
      .select()
      .from(platformSecrets)
      .where(eq(platformSecrets.category, category));
    const byKey = new Map(rows.map((r) => [r.key, r]));

    return knownKeys.map((key) => {
      const dbRow = byKey.get(key);
      if (dbRow) {
        const plain = decrypt(dbRow.encryptedPayload, getEnv().CREDENTIAL_MASTER_KEY);
        return {
          category,
          key,
          masked: mask(plain),
          source: 'db' as const,
          updatedAt: dbRow.updatedAt.toISOString(),
        };
      }
      const envValue = process.env[key];
      if (envValue && envValue.length > 0) {
        return {
          category,
          key,
          masked: mask(envValue),
          source: 'env' as const,
          updatedAt: null,
        };
      }
      return { category, key, masked: '', source: 'unset' as const, updatedAt: null };
    });
  }

  async set(category: SecretCategory, key: string, plaintext: string): Promise<void> {
    const known = SECRET_CATEGORIES[category] as readonly string[];
    if (!known.includes(key)) throw new Error(`Unknown secret key ${key} in ${category}`);
    const encryptedPayload = encrypt(plaintext, getEnv().CREDENTIAL_MASTER_KEY);
    await this.db
      .insert(platformSecrets)
      .values({ category, key, encryptedPayload })
      .onConflictDoUpdate({
        target: [platformSecrets.category, platformSecrets.key],
        set: { encryptedPayload, updatedAt: new Date() },
      });
  }

  async delete(category: SecretCategory, key: string): Promise<void> {
    await this.db
      .delete(platformSecrets)
      .where(and(eq(platformSecrets.category, category), eq(platformSecrets.key, key)));
  }
}
```

### Routes

```typescript
// packages/app/src/server/routes/secrets.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { SECRET_CATEGORIES, type SecretCategory } from '../../secrets/categories.js';
import { SecretsService } from '../../secrets/secrets.service.js';

const CATEGORY_VALUES = Object.keys(SECRET_CATEGORIES) as SecretCategory[];

const setBody = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
});

export async function registerSecretsRoutes(app: FastifyInstance): Promise<void> {
  const service = new SecretsService(getDb());

  app.get<{ Params: { category: string } }>(
    '/secrets/:category',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!(CATEGORY_VALUES as string[]).includes(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      return service.list(req.params.category as SecretCategory);
    },
  );

  app.put<{ Params: { category: string } }>(
    '/secrets/:category',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!(CATEGORY_VALUES as string[]).includes(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      const parsed = setBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      try {
        await service.set(
          req.params.category as SecretCategory,
          parsed.data.key,
          parsed.data.value,
        );
        return { ok: true };
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('Unknown secret key')) {
          return reply.code(400).send({ error: 'UnknownKey', message: err.message });
        }
        throw err;
      }
    },
  );

  app.delete<{ Params: { category: string; key: string } }>(
    '/secrets/:category/:key',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!(CATEGORY_VALUES as string[]).includes(req.params.category)) {
        return reply.code(404).send({ error: 'UnknownCategory', category: req.params.category });
      }
      await service.delete(req.params.category as SecretCategory, req.params.key);
      return reply.code(204).send();
    },
  );
}
```

Register in `server.ts`.

### Test

5 integration tests (see plan): set/get round-trip, masking, env fallback when no DB row, delete restores env, unknown-key rejection.

**Commit:**
```bash
pnpm --filter @mynah/app test secrets.service
pnpm --filter @mynah/app typecheck
git add packages/app/src/secrets packages/app/src/server packages/app/tests/secrets
git commit -m "feat(app): SecretsService + /secrets/:category routes (encrypted KV, env fallback)"
```

---

## Task 3 — Settings page

**Files:**
- `packages/dashboard/src/hooks/useSecrets.ts` (new)
- `packages/dashboard/src/routes/pages/Settings.tsx` (new)
- `packages/dashboard/src/routes/router.tsx` (add `/settings`)
- `packages/dashboard/src/components/shell/Sidebar.tsx` (add Settings nav item)

### Hook

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export type SecretCategory = 'reddit' | 'llm' | 'telegram';

export interface MaskedSecret {
  category: SecretCategory;
  key: string;
  masked: string;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

export function useSecrets(category: SecretCategory) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['secrets', category],
    queryFn: () => api<MaskedSecret[]>(`/secrets/${category}`, { token }),
    enabled: !!token,
  });
}

export function useSetSecret(category: SecretCategory) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api<{ ok: true }>(`/secrets/${category}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ key, value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', category] }),
  });
}

export function useDeleteSecret(category: SecretCategory) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<void>(`/secrets/${category}/${key}`, { method: 'DELETE', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', category] }),
  });
}
```

### Page

Two-pane layout: category tabs on left (Reddit, LLM, Telegram), form on right. Each row shows:
- key name
- current masked value + source badge (`db` / `env` / `unset`)
- inline "Edit" button → expands an input + Save/Cancel
- for `db`-sourced rows, a "Reset to env" button (DELETE)

Use glass cards, lucide icons (Key for LLM, MessageCircle for Telegram, Globe for Reddit).

### Nav

Add `{ to: '/settings', label: 'Settings', icon: Settings }` to Sidebar NAV.

**Commit:**
```bash
pnpm --filter @mynah/dashboard typecheck && pnpm --filter @mynah/dashboard build
git add packages/dashboard
git commit -m "feat(dashboard): Settings page with Reddit/LLM/Telegram secret management"
```

---

## Task 4 — Docker verify + tag

- Full stack up, migrations apply new table
- Browser `/settings`, set a dummy Reddit client_id, save, refresh page — masked value persists
- Set an LLM API key, verify `source: 'db'` replaces the `env`-sourced row
- DELETE the LLM key, verify it flips back to `source: 'env'`
- Tag `plan19-complete`

**Acceptance:**
1. ✅ Table + migration deploys
2. ✅ `/secrets/reddit` returns all 4 expected keys (all `unset` or `env` initially)
3. ✅ PUT masks on next GET
4. ✅ DELETE restores env fallback
5. ✅ Settings page renders, save/delete work, source badges accurate
6. ✅ Tag pushed

## Out of scope

- **Using the stored secrets.** `SecretsService.resolve()` exists but nothing consumes it yet. Plan 20 onwards wires consumers.
- Rotating encryption keys (rewrapping all rows under a new `CREDENTIAL_MASTER_KEY`) — future plan
- Secret import/export — future plan
- Audit log of who changed what — future plan

---

**End of Plan 19.**
