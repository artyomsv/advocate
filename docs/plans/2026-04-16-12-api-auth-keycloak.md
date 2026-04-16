# API + Auth (Keycloak JWT) Implementation Plan (Plan 12)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Secure every non-health Fastify route behind Keycloak-issued JWTs, validated via Keycloak's JWKS endpoint. Provide role-based authorisation (single `advocate-owner` role for MVP) and a development-only bypass so existing smoke tests + integration tests keep running without a live Keycloak.

**Architecture:** Add a single auth module that (1) fetches Keycloak's JWKS (with caching + rotation), (2) exposes a `authenticate` preHandler that parses + validates the `Authorization: Bearer …` header and decorates the request with the verified payload, and (3) exposes a `requireRole(name)` guard that inspects `realm_access.roles` in the token. The existing `@fastify/jwt` plugin stays out of it — we do not use its signing features; JWKS verification is direct. All mutating routes and read-modify-write surfaces get `authenticate` applied. `/health` and `/health/ready` remain public. A boolean env var `AUTH_DEV_BYPASS` short-circuits both decorators to `next()` — used only in local dev/CI.

**Tech Stack:** `get-jwks` (lightweight JWKS fetcher + RSA cache) · `jose` (JWT verification — already transitive) · `zod` (env validation, already used)

**Prerequisites:**
- Plan 11e complete (tag `plan11e-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`
- Keycloak reachable at `KEYCLOAK_URL` (default `http://host.docker.internal:9080`) — actual realm setup in Task 1

---

## File Structure Overview

```
packages/app/src/auth/
├── index.ts                          # Barrel
├── keycloak-jwt.ts                   # JWKS-backed verifier + Fastify decorator
├── require-role.ts                   # Role-guard factory
└── types.ts                          # AuthenticatedUser, TokenPayload

packages/app/src/config/env.ts        # (modify) — add KEYCLOAK_JWKS_URL, AUTH_DEV_BYPASS

packages/app/src/server/server.ts     # (modify) — register authenticate decorator + apply to routes

packages/app/tests/auth/
├── keycloak-jwt.test.ts              # Unit: JWKS verification with a self-signed test keypair
└── require-role.test.ts              # Unit: role guard behaviour

packages/app/tests/server/
└── auth-integration.test.ts          # Integration: /products returns 401 without token, 200 with valid token

packages/app/package.json              # (modify) — add `get-jwks` and `jose` as explicit deps (jose is currently transitive)
packages/app/README.md                 # (modify) — section on Keycloak setup

infra/keycloak/advocate-realm.json     # NEW — importable realm definition

.env.example                           # (modify) — AUTH_DEV_BYPASS default=false
```

## Design decisions

1. **JWKS, not static secret.** Keycloak rotates signing keys. A static shared secret would require manual rotation and forever out-of-band coupling. `get-jwks` caches the JWKS set and fetches fresh when the token's `kid` isn't cached.

2. **One role for MVP: `advocate-owner`.** The system has exactly one human operator — the product owner. Multi-tenant / multi-role is out of scope until a second human needs access.

3. **Bypass env var.** Protecting every route with mandatory auth breaks our existing Docker smoke tests, integration tests, and ad-hoc curl sessions. `AUTH_DEV_BYPASS=true` (default `false`) short-circuits `authenticate` and `requireRole` to `next()`. It MUST NOT be set in production — we fail the boot if `NODE_ENV=production && AUTH_DEV_BYPASS=true`.

4. **No session store.** Tokens are verified statelessly on each request. No Redis-backed session, no refresh endpoint — the client (Plan 13 dashboard) talks to Keycloak directly for token refresh.

5. **Public routes.** `/health` and `/health/ready` stay public. `/metrics` (when added later) will also be public but rate-limited.

6. **Realm import, not auto-creation.** We ship a `realm.json` the user imports into their existing Keycloak at 9080. The plan does not automate Keycloak CRUD — that requires admin credentials we don't want to encode.

7. **jose over @fastify/jwt.** `@fastify/jwt` is installed but its strengths are signing + cookie handling. For pure JWKS-verify we use `jose.jwtVerify` with the key set returned by `get-jwks`. `@fastify/jwt` stays in package.json but we do not register the plugin. If the reviewer wants to remove it, do so in a follow-up — not in this plan (scope).

---

## Task 1: Keycloak Realm + Client (manual infrastructure setup)

**Goal:** A realm named `advocate` in the user's existing Keycloak at port 9080, with a public client `advocate-app` and a role `advocate-owner`. Ship a `realm.json` that imports the whole thing in one click.

**Files:**
- Create: `infra/keycloak/advocate-realm.json`
- Create: `infra/keycloak/README.md`

- [ ] **Step 1.1: Create `infra/keycloak/advocate-realm.json`**

This is a minimal Keycloak 24+ realm export. Import via Keycloak admin UI → Create realm → Choose file.

```json
{
  "realm": "advocate",
  "enabled": true,
  "sslRequired": "external",
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "duplicateEmailsAllowed": false,
  "resetPasswordAllowed": false,
  "editUsernameAllowed": false,
  "bruteForceProtected": true,
  "accessTokenLifespan": 900,
  "ssoSessionIdleTimeout": 1800,
  "ssoSessionMaxLifespan": 36000,
  "roles": {
    "realm": [
      {
        "name": "advocate-owner",
        "description": "Primary system operator. Full API access."
      }
    ]
  },
  "clients": [
    {
      "clientId": "advocate-app",
      "enabled": true,
      "publicClient": true,
      "standardFlowEnabled": true,
      "directAccessGrantsEnabled": true,
      "serviceAccountsEnabled": false,
      "redirectUris": [
        "http://localhost:36400/*",
        "http://localhost:5173/*"
      ],
      "webOrigins": ["+"],
      "protocol": "openid-connect",
      "attributes": {
        "pkce.code.challenge.method": "S256"
      },
      "fullScopeAllowed": true
    }
  ]
}
```

- [ ] **Step 1.2: Create `infra/keycloak/README.md`**

```markdown
# Keycloak setup for Advocate

Advocate authenticates users against an existing Keycloak instance (shared with
the other projects on this machine), running at `http://localhost:9080`.

## Importing the realm (one-time)

1. Sign in to Keycloak admin console: `http://localhost:9080/admin/` (realm:
   `master`, admin account).
2. In the top-left realm dropdown, click **Create realm**.
3. Under **Resource file** click **Browse** and pick
   `infra/keycloak/advocate-realm.json` from this repo. Click **Create**.
4. The `advocate` realm is now active with one client (`advocate-app`) and one
   realm role (`advocate-owner`).

## Creating an owner user

1. In the `advocate` realm, go to **Users** → **Add user**.
2. Username: your choice (e.g. `owner`). Set Email, First name, Last name.
3. Tick **Email verified**. Save.
4. **Credentials** tab → **Set password**. Untick **Temporary**. Save.
5. **Role mapping** tab → **Assign role** → filter by "Realm roles" → select
   `advocate-owner` → Assign.

## Sanity-check token issuance

From a bash shell (replace `OWNER_PASSWORD`):

```bash
curl -s -X POST \
  "http://localhost:9080/realms/advocate/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=advocate-app&grant_type=password&username=owner&password=OWNER_PASSWORD" \
  | jq -r .access_token
```

The resulting JWT should contain `realm_access.roles = ["advocate-owner", ...]`.

## JWKS endpoint

Advocate verifies tokens against:
`http://localhost:9080/realms/advocate/protocol/openid-connect/certs`

In Docker Compose, the API + worker reach Keycloak via
`http://host.docker.internal:9080` (the `KEYCLOAK_URL` env var).
```

- [ ] **Step 1.3: Commit**

```bash
git add infra/keycloak/
git commit -m "infra(keycloak): add importable realm + setup docs for Advocate auth"
```

No code to test in this task — the user follows the README manually after Plan 12 execution, or before running Task 6 verification. If they already have an `advocate` realm from earlier experiments, importing again will fail with a conflict — they either delete the existing realm or skip the import.

---

## Task 2: JWKS-backed JWT verifier

**Files:**
- Create: `packages/app/src/auth/types.ts`
- Create: `packages/app/src/auth/keycloak-jwt.ts`
- Create: `packages/app/src/auth/index.ts`
- Create: `packages/app/tests/auth/keycloak-jwt.test.ts`
- Modify: `packages/app/package.json` (add `get-jwks` + `jose`)
- Modify: `packages/app/src/config/env.ts`

- [ ] **Step 2.1: Add deps**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/app add get-jwks jose
```

Expected: `get-jwks@^9` and `jose@^5` resolved, lockfile updated. Commit this as a separate step.

```bash
git add pnpm-lock.yaml packages/app/package.json
git commit -m "chore(app): add get-jwks + jose for JWKS-backed JWT verification"
```

- [ ] **Step 2.2: Extend env validation**

Modify `packages/app/src/config/env.ts`. Find the existing zod schema and add:

```typescript
KEYCLOAK_URL: z.string().url().default('http://host.docker.internal:9080'),
KEYCLOAK_REALM: z.string().min(1).default('advocate'),
KEYCLOAK_CLIENT_ID: z.string().min(1).default('advocate-app'),
AUTH_DEV_BYPASS: z
  .string()
  .transform((v) => v === 'true' || v === '1')
  .default('false'),
```

After the schema parses, add this guard:

```typescript
if (parsed.NODE_ENV === 'production' && parsed.AUTH_DEV_BYPASS) {
  throw new Error(
    'AUTH_DEV_BYPASS=true is not permitted when NODE_ENV=production',
  );
}
```

(If `KEYCLOAK_URL` / `KEYCLOAK_REALM` / `KEYCLOAK_CLIENT_ID` are already in the schema from earlier plans, leave them alone — only add the `AUTH_DEV_BYPASS` line.)

Also export a test-only cache-reset helper at the bottom of the file. `getEnv()` memoises its result, so the auth integration test (Task 5) needs a way to re-parse after `process.env` mutations. Add:

```typescript
/** Test-only: discard the memoised env so the next getEnv() re-parses process.env. */
export function resetEnvForTest(): void {
  cachedEnv = null;
}
```

If the existing module uses a different name for the cache variable (`_env`, `memoisedEnv`, etc.), adjust accordingly. Don't refactor unrelated code.

Run:
```bash
pnpm --filter @advocate/app typecheck
```

- [ ] **Step 2.3: Create `packages/app/src/auth/types.ts`**

```typescript
/**
 * Shape we pull off a verified Keycloak access token. Keycloak's standard
 * claims include `sub` (user id), `preferred_username`, `email`,
 * `realm_access.roles`, and `resource_access.<client>.roles`.
 */
export interface TokenPayload {
  sub: string;
  iss: string;
  aud?: string | readonly string[];
  exp: number;
  iat: number;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: readonly string[] };
  resource_access?: Record<string, { roles?: readonly string[] }>;
}

/** Decoded + validated user, attached to `req.user` by the preHandler. */
export interface AuthenticatedUser {
  sub: string;
  username?: string;
  email?: string;
  realmRoles: readonly string[];
}
```

- [ ] **Step 2.4: Write failing test FIRST**

Create `packages/app/tests/auth/keycloak-jwt.test.ts`. We sign tokens with a locally-generated RSA keypair and serve a stub JWKS so there's no live Keycloak in the test:

```typescript
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyKeycloakToken } from '../../src/auth/keycloak-jwt.js';

describe('verifyKeycloakToken', () => {
  let server: Server;
  let privateKey: CryptoKey;
  let kid: string;
  let issuerBase: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    const jwk = await exportJWK(keyPair.publicKey);
    kid = 'test-kid-1';
    const jwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };

    server = createServer((req, res) => {
      if (req.url?.endsWith('/protocol/openid-connect/certs')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    }).listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    issuerBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function mintToken(overrides: Record<string, unknown> = {}): Promise<string> {
    return new SignJWT({
      sub: 'user-1',
      preferred_username: 'owner',
      email: 'owner@example.com',
      realm_access: { roles: ['advocate-owner', 'default-roles-advocate'] },
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/advocate`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(privateKey);
  }

  it('verifies a valid token and returns the payload', async () => {
    const token = await mintToken();
    const user = await verifyKeycloakToken({
      token,
      jwksUri: `${issuerBase}/realms/advocate/protocol/openid-connect/certs`,
      issuer: `${issuerBase}/realms/advocate`,
    });
    expect(user.sub).toBe('user-1');
    expect(user.username).toBe('owner');
    expect(user.realmRoles).toContain('advocate-owner');
  });

  it('rejects a token signed by an unknown key', async () => {
    const otherPair = await generateKeyPair('RS256', { extractable: true });
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setIssuer(`${issuerBase}/realms/advocate`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(otherPair.privateKey);
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/advocate/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/advocate`,
      }),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/advocate`)
      .setAudience('account')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/advocate/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/advocate`,
      }),
    ).rejects.toThrow();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await mintToken();
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/advocate/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/SOMETHING-ELSE`,
      }),
    ).rejects.toThrow();
  });
});
```

Create the directory first:
```bash
mkdir -p packages/app/tests/auth
```

Run the test — MUST FAIL with module-not-found:
```bash
pnpm --filter @advocate/app test keycloak-jwt
```

- [ ] **Step 2.5: Implement `packages/app/src/auth/keycloak-jwt.ts`**

```typescript
import getJwks, { type GetKeyFunction } from 'get-jwks';
import { createLocalJWKSet, jwtVerify, type JWTPayload, type JWK } from 'jose';
import { childLogger } from '../config/logger.js';
import type { AuthenticatedUser, TokenPayload } from './types.js';

const log = childLogger('auth.keycloak');

export interface VerifyTokenOptions {
  token: string;
  jwksUri: string;
  issuer: string;
  /** Audience claim is optional — Keycloak sets it to 'account' by default; we don't pin it. */
  audience?: string;
}

/**
 * Verify a Keycloak-issued JWT against a JWKS URL.
 *
 * Uses `get-jwks` for TTL-cached JWKS lookup so we don't hit Keycloak on
 * every request, then defers actual signature verification to `jose`.
 */
export async function verifyKeycloakToken(
  options: VerifyTokenOptions,
): Promise<AuthenticatedUser> {
  const jwks = getJwks({ jwksPath: '' });
  const { token, jwksUri, issuer, audience } = options;

  // Fetch the JWKS once and build a local keyset for jose. This keeps the
  // verification synchronous and predictable. get-jwks handles the HTTP + cache.
  const jwksJson = await jwks.getJwksRaw(jwksUri);
  const keySet = createLocalJWKSet({ keys: jwksJson.keys as JWK[] });

  const { payload } = await jwtVerify<TokenPayload>(token, keySet, {
    issuer,
    audience,
  });

  const realmRoles = payload.realm_access?.roles ?? [];
  log.debug({ sub: payload.sub, realmRoles }, 'token verified');

  return {
    sub: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    realmRoles,
  };
}

/**
 * Build the canonical JWKS URI for a Keycloak realm.
 */
export function jwksUriForRealm(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`;
}

/**
 * Build the canonical issuer string Keycloak sets in the `iss` claim.
 */
export function issuerForRealm(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}`;
}
```

If the installed `get-jwks` version exposes `getPublicKey` / `getSecret` but not `getJwksRaw`, swap to the available method and rebuild the local keyset from the returned key. The test suite is the spec: whichever API you use, the four tests must pass.

- [ ] **Step 2.6: Barrel `packages/app/src/auth/index.ts`**

```typescript
export * from './keycloak-jwt.js';
export * from './types.js';
```

- [ ] **Step 2.7: Run test + commit**

```bash
pnpm --filter @advocate/app test keycloak-jwt
pnpm --filter @advocate/app typecheck
pnpm lint
```

All 4 tests pass. Biome clean for new files.

```bash
git add packages/app/src/auth/ packages/app/src/config/env.ts packages/app/tests/auth/
git commit -m "feat(app): add Keycloak JWT verifier backed by JWKS cache"
```

---

## Task 3: Fastify decorator + role guard

**Files:**
- Create: `packages/app/src/auth/require-role.ts`
- Create: `packages/app/src/auth/fastify-plugin.ts`
- Create: `packages/app/tests/auth/require-role.test.ts`
- Modify: `packages/app/src/auth/index.ts` (extend barrel)

- [ ] **Step 3.1: Test for role guard (failing first)**

Create `packages/app/tests/auth/require-role.test.ts`:

```typescript
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { requireRole } from '../../src/auth/require-role.js';
import type { AuthenticatedUser } from '../../src/auth/types.js';

function appWithRole(user: AuthenticatedUser | null, role: string) {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    if (user) (req as typeof req & { user: AuthenticatedUser }).user = user;
  });
  app.get('/guarded', { preHandler: requireRole(role) }, async () => ({ ok: true }));
  return app;
}

const baseUser = (roles: string[]): AuthenticatedUser => ({
  sub: 'u',
  username: 'u',
  email: 'u@example.com',
  realmRoles: roles,
});

describe('requireRole', () => {
  it('allows when realmRoles includes the role', async () => {
    const app = appWithRole(baseUser(['advocate-owner']), 'advocate-owner');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects with 403 when role missing', async () => {
    const app = appWithRole(baseUser(['default-roles']), 'advocate-owner');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Forbidden');
  });

  it('rejects with 401 when user absent', async () => {
    const app = appWithRole(null, 'advocate-owner');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(401);
  });
});
```

Run: `pnpm --filter @advocate/app test require-role` → MUST FAIL (module not found).

- [ ] **Step 3.2: Implement `packages/app/src/auth/require-role.ts`**

```typescript
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthenticatedUser } from './types.js';

/**
 * Fastify preHandler that rejects the request unless the authenticated
 * user carries `roleName` in their realm roles.
 *
 * Requires that an earlier preHandler (typically `authenticate`) populated
 * `req.user`. Returns 401 if absent, 403 if role missing.
 */
export function requireRole(roleName: string): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (req as FastifyRequest & { user?: AuthenticatedUser }).user;
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!user.realmRoles.includes(roleName)) {
      reply.code(403).send({ error: 'Forbidden', missingRole: roleName });
      return;
    }
  };
}
```

- [ ] **Step 3.3: Implement `packages/app/src/auth/fastify-plugin.ts`**

```typescript
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  preHandlerHookHandler,
} from 'fastify';
import fp from 'fastify-plugin';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';
import {
  issuerForRealm,
  jwksUriForRealm,
  verifyKeycloakToken,
} from './keycloak-jwt.js';
import type { AuthenticatedUser } from './types.js';

const log = childLogger('auth.plugin');

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }
}

/**
 * Registers a single decorator `app.authenticate` — a preHandler that parses
 * `Authorization: Bearer …`, verifies via JWKS, and populates `req.user`.
 * When `AUTH_DEV_BYPASS=true` the preHandler is a no-op that attaches a
 * synthetic owner user so downstream role guards still see the `advocate-owner`
 * role.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  const env = getEnv();

  const jwksUri = jwksUriForRealm(env.KEYCLOAK_URL, env.KEYCLOAK_REALM);
  const issuer = issuerForRealm(env.KEYCLOAK_URL, env.KEYCLOAK_REALM);

  if (env.AUTH_DEV_BYPASS) {
    log.warn({ jwksUri, issuer }, 'AUTH_DEV_BYPASS=true — all requests treated as owner');
  } else {
    log.info({ jwksUri, issuer }, 'auth enabled — JWKS verification active');
  }

  const authenticate: preHandlerHookHandler = async (
    req: FastifyRequest,
    reply: FastifyReply,
  ) => {
    if (env.AUTH_DEV_BYPASS) {
      req.user = {
        sub: 'dev-bypass',
        username: 'dev',
        email: 'dev@local',
        realmRoles: ['advocate-owner'],
      };
      return;
    }
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'Unauthorized', reason: 'missing bearer token' });
      return;
    }
    const token = header.slice('Bearer '.length).trim();
    try {
      req.user = await verifyKeycloakToken({ token, jwksUri, issuer });
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'token verification failed');
      reply.code(401).send({ error: 'Unauthorized', reason: 'invalid token' });
    }
  };

  app.decorate('authenticate', authenticate);
});
```

- [ ] **Step 3.4: Extend barrel**

Edit `packages/app/src/auth/index.ts`:

```typescript
export * from './fastify-plugin.js';
export * from './keycloak-jwt.js';
export * from './require-role.js';
export * from './types.js';
```

- [ ] **Step 3.5: Run + commit**

```bash
pnpm --filter @advocate/app test require-role
pnpm --filter @advocate/app typecheck
pnpm lint
```

All 3 role-guard tests pass.

```bash
git add packages/app/src/auth/ packages/app/tests/auth/require-role.test.ts
git commit -m "feat(app): add Fastify auth plugin + requireRole preHandler"
```

---

## Task 4: Apply auth to protected routes

**Files:**
- Modify: `packages/app/src/server/server.ts`
- Modify: `packages/app/src/server/routes/products.ts`
- Modify: `packages/app/src/server/routes/legends.ts`
- Modify: `packages/app/src/server/routes/legend-accounts.ts`
- Modify: `packages/app/src/server/routes/agents.ts`
- Modify: `packages/app/src/server/routes/orchestrate.ts`
- Modify: `packages/app/src/server/routes/schedules.ts`

The approach: register the auth plugin once in `buildServer()`, then in each route file pull `app.authenticate` from the parent instance and pass it via `preHandler` on every route except health checks.

- [ ] **Step 4.1: Register plugin in `server.ts`**

Open `packages/app/src/server/server.ts`. Immediately after the `Fastify()` construction (before route registration), add:

```typescript
import { authPlugin } from '../auth/index.js';
// ...
await app.register(authPlugin);
```

Place the import alphabetically and keep `await app.register(authPlugin)` **before** the first `registerXxxRoutes(app, ...)` call.

- [ ] **Step 4.2: Apply `authenticate` to each non-health route**

Pattern (use this for every mutating route + every read that returns user-scoped data):

Before:
```typescript
app.post('/products', async (req, reply) => { /* ... */ });
```

After:
```typescript
app.post('/products', { preHandler: [app.authenticate] }, async (req, reply) => { /* ... */ });
```

Apply to **every** route in these files:
- `products.ts` — POST/GET/PATCH/DELETE /products[*]
- `legends.ts` — POST/GET/PATCH/DELETE /legends[*]
- `legend-accounts.ts` — all /legend-accounts[*] + /legends/:legendId/accounts
- `agents.ts` — /agents/*
- `orchestrate.ts` — POST /orchestrate/draft
- `schedules.ts` — POST/GET/DELETE /schedules/orchestrate[*]

Do NOT touch `health.ts`.

- [ ] **Step 4.3: Typecheck + lint**

```bash
pnpm --filter @advocate/app typecheck
pnpm lint
```

- [ ] **Step 4.4: Commit**

```bash
git add packages/app/src/server/
git commit -m "feat(app): require authentication on every non-health route"
```

---

## Task 5: Integration test — real Fastify with stub JWKS

**Files:**
- Create: `packages/app/tests/server/auth-integration.test.ts`

- [ ] **Step 5.1: Write the integration test**

This test boots a full Fastify app (via `buildServer`), points it at a local stub JWKS server, and exercises `/products` behind auth. It uses `AUTH_DEV_BYPASS=false` to exercise the real path.

```typescript
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/server.js';

describe('auth integration', () => {
  let jwksServer: Server;
  let privateKey: CryptoKey;
  let issuerBase: string;
  let kid: string;
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    kid = 'itest-kid';
    const jwk = await exportJWK(keyPair.publicKey);
    const jwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };

    jwksServer = createServer((req, res) => {
      if (req.url?.endsWith('/protocol/openid-connect/certs')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    }).listen(0);
    const addr = jwksServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    issuerBase = `http://127.0.0.1:${port}`;

    // Point the app's env at our stub Keycloak BEFORE buildServer builds the router.
    process.env.KEYCLOAK_URL = issuerBase;
    process.env.KEYCLOAK_REALM = 'advocate';
    process.env.AUTH_DEV_BYPASS = 'false';
    // getEnv() is memoised — force a re-parse so the overrides above take effect.
    const { resetEnvForTest } = await import('../../src/config/env.js');
    resetEnvForTest();

    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  async function mintToken(roles: string[] = ['advocate-owner']): Promise<string> {
    return new SignJWT({
      sub: 'test-user',
      preferred_username: 'tester',
      email: 'tester@example.com',
      realm_access: { roles },
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/advocate`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(privateKey);
  }

  it('rejects GET /products without Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects GET /products with a bogus token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts GET /products with a valid owner token', async () => {
    const token = await mintToken();
    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows GET /health without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
```

- [ ] **Step 5.2: Run + commit**

```bash
pnpm --filter @advocate/app test auth-integration
```

All 4 scenarios pass.

```bash
git add packages/app/tests/server/auth-integration.test.ts
git commit -m "test(app): integration test for Keycloak-protected routes"
```

---

## Task 6: Docker round-trip with live Keycloak

**Prerequisite before starting:** the user has imported `infra/keycloak/advocate-realm.json` into their local Keycloak (Task 1 README) and created an owner user.

- [ ] **Step 6.1: Add `AUTH_DEV_BYPASS` to compose**

Edit `docker-compose.yml`. In the `api` service's `environment:` block, add:

```yaml
      AUTH_DEV_BYPASS: "${AUTH_DEV_BYPASS:-false}"
```

Do the same for `worker` (harmless — worker doesn't serve HTTP but the env parsing is shared).

Commit:
```bash
git add docker-compose.yml
git commit -m "feat: wire AUTH_DEV_BYPASS env through compose to api + worker"
```

- [ ] **Step 6.2: Rebuild stack with auth disabled (sanity)**

```bash
AUTH_DEV_BYPASS=true docker compose up -d --build
```

Verify `/health` responds, `/products` responds (no 401 because bypass is on):
```bash
curl -s http://localhost:36401/health
curl -s http://localhost:36401/products | head -c 80
```

- [ ] **Step 6.3: Rebuild with auth ENABLED + real Keycloak**

```bash
docker compose down
docker compose up -d --build
```

Fetch a token from Keycloak (`OWNER_PASSWORD` is whatever you set in Task 1):

```bash
TOKEN=$(curl -s -X POST \
  "http://localhost:9080/realms/advocate/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=advocate-app&grant_type=password&username=owner&password=OWNER_PASSWORD" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))")

echo "${TOKEN:0:40}…"
```

Call a protected endpoint WITHOUT the token — expect 401:
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:36401/products
# expected: 401
```

Call with the token — expect 200:
```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Authorization: Bearer $TOKEN" \
  http://localhost:36401/products
# expected: 200
```

- [ ] **Step 6.4: Tear down + tag**

```bash
docker compose down
git tag -a plan12-complete -m "Plan 12 (API auth) complete — all non-health routes require Keycloak-issued JWTs; AUTH_DEV_BYPASS for dev/CI"
git push origin master
git push origin plan12-complete
```

- [ ] **Step 6.5: Update plan README**

Edit `docs/plans/README.md` — change Plan 12's row to:

```
| 12 | App: API + Auth — Fastify routes + Keycloak JWT | ✅ Complete (tag `plan12-complete`) | [2026-04-16-12-api-auth-keycloak.md](2026-04-16-12-api-auth-keycloak.md) |
```

Commit:
```bash
git add docs/plans/README.md
git commit -m "docs(plan): mark Plan 12 (API auth) complete"
git push origin master
```

---

## Acceptance Criteria

1. ✅ `realm.json` imports cleanly into Keycloak; creates `advocate` realm + `advocate-app` client + `advocate-owner` role
2. ✅ `verifyKeycloakToken` validates tokens against a JWKS endpoint (4 unit tests pass)
3. ✅ `requireRole` rejects missing user (401) and missing role (403) (3 tests pass)
4. ✅ Fastify decorator `app.authenticate` applied to every non-health route
5. ✅ Integration test exercises real Fastify boot + stub JWKS (4 tests pass)
6. ✅ `AUTH_DEV_BYPASS=true` short-circuits to a synthetic owner user; refuses to boot when `NODE_ENV=production && AUTH_DEV_BYPASS=true`
7. ✅ Docker smoke test passes: without token → 401; with owner token → 200; `/health` stays public
8. ✅ Tag `plan12-complete` pushed

## Out of Scope

- **User management UI** — Keycloak admin console handles it
- **Per-resource authorization** (RBAC on individual products/legends) — single `advocate-owner` role for MVP
- **Refresh token flow** — client (dashboard, Plan 13) handles refresh directly against Keycloak
- **Service-to-service tokens** (worker → API) — worker doesn't call the HTTP API, it talks to the DB directly
- **Rate limiting, audit logging** — separate plans
- **Keycloak realm automation** — the `realm.json` import is manual

---

**End of Plan 12 (API + Auth Keycloak JWT).**
