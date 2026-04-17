# Plan 20 — Reddit OAuth (app creds + per-legend authorization)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Wire Reddit's OAuth 2.0 Authorization Code flow. The app uses credentials stored via Plan 19's Settings page. Per-legend authorization: owner clicks "Connect Reddit" on a legend, redirected to Reddit, logs in as that legend's reddit account, tokens come back encrypted and stored. Refresh handled automatically when expired. Tag `plan20-complete`.

**Prerequisites:**
- Plan 19 complete (SecretsService can resolve `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_REDIRECT_URI` + `REDDIT_USER_AGENT`)
- Owner will create a Reddit app at `https://www.reddit.com/prefs/apps` (type: "web app", redirect URI matching `REDDIT_REDIRECT_URI` — default `http://localhost:36401/oauth/reddit/callback`)

## Architecture

- **App credentials:** `SecretsService.resolve('reddit', '…')` for client_id/secret/redirect_uri/user_agent.
- **Per-legend tokens:** stored in existing `legend_credentials` table (AES-GCM, encrypted). One "reddit-oauth" entry per legend holds `{ accessToken, refreshToken, scope, expiresAt }` serialized as JSON.
- **Flow:**
  1. Dashboard: owner clicks "Connect Reddit" on legend X → browser goes to `GET /oauth/reddit/authorize?legendId=X`.
  2. API builds Reddit authorize URL (with `state = <legendId>:<nonce>` signed + verifiable), 302 redirects.
  3. Reddit prompts login, user authorizes, redirects to `REDDIT_REDIRECT_URI?code=…&state=…`.
  4. API `/oauth/reddit/callback` verifies state, exchanges code for tokens, upserts legend_credentials row, redirects to dashboard `/legends/X?connected=reddit`.
- **Refresh:** `RedditClient.ensureValidToken(legendId)` — when current access token has < 60s left, POSTs to token endpoint with `grant_type=refresh_token`, stores new access token, returns it.

---

## Task 1 — Reddit OAuth helper module

**Files:**
- `packages/app/src/reddit/oauth.ts` (new)
- `packages/app/src/reddit/tokens.ts` (new)
- `packages/app/src/reddit/state.ts` (new — signed state codec)
- `packages/app/tests/reddit/oauth.test.ts`
- `packages/app/tests/reddit/state.test.ts`

### `state.ts`

```typescript
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export interface StatePayload {
  legendId: string;
  nonce: string;
}

export function encodeState(payload: StatePayload, secret: string): string {
  const body = `${payload.legendId}:${payload.nonce}`;
  const sig = createHmac('sha256', secret).update(body).digest('base64url').slice(0, 22);
  return `${body}:${sig}`;
}

export function decodeState(raw: string, secret: string): StatePayload | null {
  const parts = raw.split(':');
  if (parts.length !== 3) return null;
  const [legendId, nonce, sig] = parts;
  if (!legendId || !nonce || !sig) return null;
  const body = `${legendId}:${nonce}`;
  const expected = createHmac('sha256', secret).update(body).digest('base64url').slice(0, 22);
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return { legendId, nonce };
}

export function newNonce(): string {
  return randomBytes(16).toString('base64url');
}
```

### `oauth.ts`

```typescript
export interface RedditAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userAgent: string;
}

export interface RedditTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export const REDDIT_SCOPES = 'identity read submit history edit' as const;

export function buildAuthorizeUrl(
  config: RedditAppConfig,
  state: string,
  duration: 'temporary' | 'permanent' = 'permanent',
): string {
  const url = new URL('https://www.reddit.com/api/v1/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('duration', duration);
  url.searchParams.set('scope', REDDIT_SCOPES);
  return url.toString();
}

export async function exchangeCodeForToken(
  config: RedditAppConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Reddit token exchange failed: ${res.status}`);
  }
  return (await res.json()) as RedditTokenResponse;
}

export async function refreshAccessToken(
  config: RedditAppConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Reddit token refresh failed: ${res.status}`);
  }
  return (await res.json()) as RedditTokenResponse;
}
```

### `tokens.ts`

A thin wrapper reading/writing the legend's `reddit-oauth` credential.

```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { LegendCredentialService } from '../legend-accounts/credential.service.js';
import type * as schema from '../db/schema.js';

export interface RedditTokens {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: string; // ISO timestamp
}

const PLATFORM = 'reddit';
const LABEL = 'oauth';

export class RedditTokenStore {
  readonly #creds: LegendCredentialService;

  constructor(db: NodePgDatabase<typeof schema>, masterKey: string) {
    this.#creds = new LegendCredentialService(db, masterKey);
  }

  async save(legendAccountId: string, tokens: RedditTokens): Promise<void> {
    const existing = await this.#creds.list(legendAccountId);
    const current = existing.find((c) => c.platform === PLATFORM && c.label === LABEL);
    if (current) {
      await this.#creds.rotate(current.id, JSON.stringify(tokens));
    } else {
      await this.#creds.create({
        legendAccountId,
        platform: PLATFORM,
        label: LABEL,
        plaintext: JSON.stringify(tokens),
      });
    }
  }

  async load(legendAccountId: string): Promise<RedditTokens | null> {
    const list = await this.#creds.list(legendAccountId);
    const row = list.find((c) => c.platform === PLATFORM && c.label === LABEL);
    if (!row) return null;
    const plaintext = await this.#creds.reveal(row.id);
    return JSON.parse(plaintext) as RedditTokens;
  }
}
```

### Tests — `state.test.ts`

```typescript
import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, newNonce } from '../../src/reddit/state.js';

const SECRET = 'test-secret-1234567890';

describe('state codec', () => {
  it('round-trips a valid payload', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: newNonce() };
    expect(decodeState(encodeState(p, SECRET), SECRET)).toEqual(p);
  });

  it('rejects tampered state', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: 'abc' };
    const encoded = encodeState(p, SECRET);
    const tampered = `${encoded.slice(0, -3)}xyz`;
    expect(decodeState(tampered, SECRET)).toBeNull();
  });

  it('rejects state signed with a different secret', () => {
    const p = { legendId: '11111111-1111-4111-8111-111111111111', nonce: 'abc' };
    const encoded = encodeState(p, SECRET);
    expect(decodeState(encoded, 'other-secret')).toBeNull();
  });

  it('rejects malformed state', () => {
    expect(decodeState('only-two-parts', SECRET)).toBeNull();
  });
});
```

### Tests — `oauth.test.ts`

```typescript
import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  type RedditAppConfig,
} from '../../src/reddit/oauth.js';

const CFG: RedditAppConfig = {
  clientId: 'cid-abc',
  clientSecret: 'csec-xyz',
  redirectUri: 'http://localhost:36401/oauth/reddit/callback',
  userAgent: 'mynah/0.1 (by /u/owner)',
};

describe('reddit oauth', () => {
  it('buildAuthorizeUrl includes required params', () => {
    const url = buildAuthorizeUrl(CFG, 'state-abc');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.reddit.com/api/v1/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('cid-abc');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('duration')).toBe('permanent');
    expect(parsed.searchParams.get('scope')).toMatch(/identity/);
    expect(parsed.searchParams.get('state')).toBe('state-abc');
  });

  it('exchangeCodeForToken posts the correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at-1',
        token_type: 'bearer' as const,
        expires_in: 3600,
        scope: 'identity',
        refresh_token: 'rt-1',
      }),
    });
    const r = await exchangeCodeForToken(CFG, 'the-code', mockFetch as unknown as typeof fetch);
    expect(r.access_token).toBe('at-1');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=the-code');
  });

  it('exchangeCodeForToken throws on non-ok response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      exchangeCodeForToken(CFG, 'bad', mockFetch as unknown as typeof fetch),
    ).rejects.toThrow(/401/);
  });

  it('refreshAccessToken posts grant_type=refresh_token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at-2',
        token_type: 'bearer' as const,
        expires_in: 3600,
        scope: 'identity',
      }),
    });
    const r = await refreshAccessToken(CFG, 'rt-1', mockFetch as unknown as typeof fetch);
    expect(r.access_token).toBe('at-2');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('grant_type=refresh_token');
  });
});
```

### Commit

```bash
git add packages/app/src/reddit packages/app/tests/reddit
git commit -m "feat(reddit): OAuth URL builder + token exchange + HMAC-signed state"
```

---

## Task 2 — /oauth/reddit/authorize + /callback routes

**Files:**
- `packages/app/src/server/routes/oauth-reddit.ts` (new)
- `packages/app/src/server/server.ts` (register — note: CALLBACK must be public, not behind `authenticate`, because Reddit redirects there without our auth cookie)

### Routes

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { getDb } from '../../db/connection.js';
import { LegendAccountService } from '../../legend-accounts/account.service.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  type RedditAppConfig,
} from '../../reddit/oauth.js';
import { decodeState, encodeState, newNonce } from '../../reddit/state.js';
import { RedditTokenStore } from '../../reddit/tokens.js';
import { SecretsService } from '../../secrets/secrets.service.js';

async function resolveConfig(secrets: SecretsService): Promise<RedditAppConfig | null> {
  const clientId = await secrets.resolve('reddit', 'REDDIT_CLIENT_ID');
  const clientSecret = await secrets.resolve('reddit', 'REDDIT_CLIENT_SECRET');
  const redirectUri = await secrets.resolve('reddit', 'REDDIT_REDIRECT_URI');
  const userAgent = await secrets.resolve('reddit', 'REDDIT_USER_AGENT');
  if (!clientId || !clientSecret || !redirectUri || !userAgent) return null;
  return { clientId, clientSecret, redirectUri, userAgent };
}

export async function registerRedditOAuthRoutes(app: FastifyInstance): Promise<void> {
  const secrets = new SecretsService(getDb());
  const legendAccounts = new LegendAccountService(getDb());
  const tokens = new RedditTokenStore(getDb(), getEnv().CREDENTIAL_MASTER_KEY);

  const authorizeQuery = z.object({ legendAccountId: z.string().uuid() });

  // Authorize endpoint — behind dashboard auth since user initiates from the UI
  app.get('/oauth/reddit/authorize', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = authorizeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const cfg = await resolveConfig(secrets);
    if (!cfg) {
      return reply.code(400).send({
        error: 'NotConfigured',
        message:
          'Reddit app credentials are missing. Set them in Settings → Reddit first.',
      });
    }
    const state = encodeState(
      { legendId: parsed.data.legendAccountId, nonce: newNonce() },
      getEnv().CREDENTIAL_MASTER_KEY,
    );
    return reply.redirect(buildAuthorizeUrl(cfg, state));
  });

  const callbackQuery = z.object({
    code: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    error: z.string().optional(),
  });

  // Callback — PUBLIC (Reddit redirects here without our cookie)
  // Security: state is HMAC-signed with CREDENTIAL_MASTER_KEY; only requests
  // that originated from OUR /authorize can pass.
  app.get('/oauth/reddit/callback', async (req, reply) => {
    const parsed = callbackQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError' });
    }
    if (parsed.data.error) {
      return reply.code(400).send({ error: 'OAuthError', reason: parsed.data.error });
    }
    if (!parsed.data.code || !parsed.data.state) {
      return reply.code(400).send({ error: 'MissingCodeOrState' });
    }
    const statePayload = decodeState(parsed.data.state, getEnv().CREDENTIAL_MASTER_KEY);
    if (!statePayload) {
      return reply.code(400).send({ error: 'InvalidState' });
    }
    const cfg = await resolveConfig(secrets);
    if (!cfg) {
      return reply.code(500).send({ error: 'ConfigGone' });
    }

    // Verify the legend_account actually exists before doing anything
    try {
      await legendAccounts.get(statePayload.legendId);
    } catch {
      return reply.code(404).send({ error: 'LegendAccountNotFound' });
    }

    const tokenResponse = await exchangeCodeForToken(cfg, parsed.data.code);
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
    await tokens.save(statePayload.legendId, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? '',
      scope: tokenResponse.scope,
      expiresAt,
    });

    // Redirect to dashboard legend page with success flag
    const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:36400';
    return reply.redirect(`${dashboardUrl}/legends?reddit=connected&account=${statePayload.legendId}`);
  });
}
```

### Register in server.ts

Add the import + `await registerRedditOAuthRoutes(app)` after the other registrations.

### Commit

```bash
pnpm --filter @mynah/app typecheck
git add packages/app/src/server
git commit -m "feat(app): Reddit OAuth authorize + callback routes"
```

---

## Task 3 — Dashboard: "Connect Reddit" button on legends

**Files:**
- `packages/dashboard/src/hooks/useLegendAccounts.ts` (new)
- `packages/dashboard/src/routes/pages/Legends.tsx` (extend each card with connect button)

### Simplification

Full legend detail page is out of scope for Plan 20 — we'll just add a "Connect Reddit" button to the existing list card. Click → open the `/oauth/reddit/authorize?legendAccountId=<id>` URL in the same tab. Reddit flow returns to `/legends?reddit=connected&account=<id>` which the page reads from URL params and shows a toast.

**Practical wrinkle:** the existing Legends page renders `Legend` rows, not `LegendAccount` rows. A legend can have multiple accounts. For this plan, we use the FIRST reddit-platform account if it exists, or show "No Reddit account — create one via `/legend-accounts` API first" message with a copy-able curl command. Creating accounts from the UI is Plan 19-era scope and deferred.

Keep the implementation small:

```tsx
// Inside Legends.tsx existing card render:
<Button
  variant="outline"
  size="sm"
  onClick={() => {
    // authorize endpoint lives on the API origin
    const apiBase = import.meta.env.VITE_API_BASE_URL;
    window.location.href = `${apiBase}/oauth/reddit/authorize?legendAccountId=${firstRedditAccountId}`;
  }}
>
  Connect Reddit
</Button>
```

Since the button redirects via server-side redirect chain that ends up back on the dashboard, we also read `?reddit=connected&account=…` on the Legends page and show a toast-like inline banner.

### Commit

```bash
pnpm --filter @mynah/dashboard typecheck && pnpm --filter @mynah/dashboard build
git add packages/dashboard
git commit -m "feat(dashboard): Connect Reddit button on legend cards"
```

---

## Task 4 — Verify + tag

- **Unit tests pass** (state + oauth mocks)
- **Typecheck clean**
- **Docker boot** — API exposes both routes. Without Reddit app creds in Settings, hitting `/oauth/reddit/authorize` should return 400 with `NotConfigured` message. With creds set, it returns a 302 to `reddit.com/api/v1/authorize` — confirm via curl `-I`.
- Tag `plan20-complete`.

Live flow requires:
1. Create Reddit app at `https://www.reddit.com/prefs/apps`:
   - Type: **web app**
   - Redirect URI: `http://localhost:36401/oauth/reddit/callback`
2. Settings → Reddit → paste `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` + `REDDIT_REDIRECT_URI=http://localhost:36401/oauth/reddit/callback` + `REDDIT_USER_AGENT=mynah/0.1 (by /u/yourname)`
3. Create a legend account with `platform=reddit` via API
4. Click "Connect Reddit" on that legend
5. Log in as the legend's reddit user → authorize → return
6. Verify token via `psql -c "SELECT platform, label FROM legend_credentials WHERE legend_account_id='…';"`

---

## Acceptance Criteria

1. ✅ State codec round-trips + rejects tampered input (4 tests)
2. ✅ OAuth URL builder produces correct reddit.com URL
3. ✅ Token exchange + refresh POST the right form body (mocked fetch)
4. ✅ `/oauth/reddit/authorize` returns 400 when creds unset
5. ✅ `/oauth/reddit/callback` verifies state signature
6. ✅ Tokens stored encrypted in `legend_credentials`
7. ⚪ Live flow (owner manual — needs Reddit app)
8. ✅ Tag `plan20-complete`

## Out of scope

- Legend account creation UI (stays API-only; Plan 19's Settings approach could extend to a "New account" form in a future plan)
- Scopes beyond `identity read submit history edit`
- Multi-account per legend per platform (assume one reddit account per legend for now)

---

**End of Plan 20.**
