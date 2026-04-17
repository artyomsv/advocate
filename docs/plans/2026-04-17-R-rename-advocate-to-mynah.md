# Rename Advocate → Mynah (Plan R)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rename the project from `advocate` to `mynah` across every non-historical surface: package scopes, Docker containers, DB identity, env vars, logger components, docs. Tag `rename-complete`.

**Architecture:** Three passes — logical (TypeScript package scope), infrastructure (Docker + DB identity), peripheral (env/docs/comments). Run tests after each pass. Historical plan files stay untouched.

**Prerequisites:**
- Plan 12 complete (tag `plan12-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate` (directory rename is a manual post-step)
- Docker stack is DOWN before starting

**Scope frozen (NOT renamed):**
- `docs/plans/*.md` for plans 01–12 — historical records of work against `@advocate/*`
- `docs/reference/*.md` — vision docs, keep as snapshot
- `docs/architecture.md` — can be updated incrementally in doc touch-ups later
- Git history — commit messages and tags stay
- Memory entries (user-private, updated by controller as it goes)
- `E:/Projects/Stukans/monorepo/auth/realms/mynah-realm.json` — already named correctly

**DB identity decision:** The existing Postgres volume `pgdata` holds dev-local data (Fairy Book Store product + Sarah Mitchell legend). All re-seedable. Task 2 drops the volume and recreates under the `mynah` role. No data migration script.

---

## File Structure Overview

```
package.json                          # root "name": "advocate-monorepo" → "mynah-monorepo"
packages/engine/package.json          # "@advocate/engine" → "@mynah/engine"
packages/app/package.json             # "@advocate/app" → "@mynah/app" + dep ref
pnpm-lock.yaml                        # regenerated

packages/engine/src/**                # comments + logger strings mentioning "advocate"
packages/app/src/**                   # imports, logger components, comments
packages/app/tests/**                 # imports

packages/app/Dockerfile               # non-root user `advocate` → `mynah`
docker-compose.yml                    # service names + container_names + DB creds + volume
.env                                  # DATABASE_URL + POSTGRES_* (manual — not git-tracked)
.env.example                          # DATABASE_URL default

.claude/CLAUDE.md                     # project instructions (currently lives in root .claude)
README.md
packages/app/docs/auth.md             # (already mynah-correct, just verify)
docs/plans/README.md                  # top-line references

docs/plans/2026-04-17-R-rename-...md  # this plan itself
```

---

## Task 1: TypeScript package scope rename

**Files:**
- Modify: `package.json` (root)
- Modify: `packages/engine/package.json`
- Modify: `packages/app/package.json`
- Modify: every `*.ts` file importing `@advocate/engine` (29 total per grep)
- Modify: `packages/app/src/index.ts`, `packages/engine/src/index.ts` (scope-related exports if any)

- [ ] **Step 1.1: Root `package.json`**

Change `"name": "advocate-monorepo"` → `"name": "mynah-monorepo"`. If description/repo URL mentions advocate, update them too.

- [ ] **Step 1.2: `packages/engine/package.json`**

`"name": "@advocate/engine"` → `"name": "@mynah/engine"`.

- [ ] **Step 1.3: `packages/app/package.json`**

`"name": "@advocate/app"` → `"name": "@mynah/app"`.
`"@advocate/engine": "workspace:*"` → `"@mynah/engine": "workspace:*"`.

- [ ] **Step 1.4: Regenerate lockfile**

```bash
cd E:/Projects/Stukans/advocate
pnpm install
```

pnpm writes the new package scope into `pnpm-lock.yaml`.

- [ ] **Step 1.5: Rewrite every `@advocate/` import**

Run (safe, idempotent):

```bash
# Find all files with the import (use Grep tool, not raw grep)
# Then Edit each file — replace `from '@advocate/engine'` with `from '@mynah/engine'`
```

Exact string transforms:
- `from '@advocate/engine'` → `from '@mynah/engine'`
- `import '@advocate/engine'` → `import '@mynah/engine'`
- `require('@advocate/engine')` → `require('@mynah/engine')` (if any)

Files to touch (27 per grep):
- `packages/app/src/agents/base-agent.ts`
- `packages/app/src/agents/types.ts`
- `packages/app/src/heartbeat/bullmq-scheduler.ts`
- `packages/app/src/llm/anthropic.ts`, `google.ts`, `openai.ts`, `default-router.ts`, `pricing.ts`
- `packages/app/src/notifications/telegram.ts`
- `packages/app/src/server/routes/agents.ts`, `orchestrate.ts`, `schedules.ts`
- `packages/app/src/worker/orchestrate-worker.ts`
- `packages/app/tests/agents/base-agent.test.ts`
- `packages/app/tests/agents/campaign-lead.test.ts`
- `packages/app/tests/agents/content-writer.test.ts`
- `packages/app/tests/agents/quality-gate.test.ts`
- `packages/app/tests/agents/strategist.test.ts`
- `packages/app/tests/heartbeat/bullmq-scheduler.test.ts`
- `packages/app/tests/orchestrator/orchestrator.service.test.ts`

- [ ] **Step 1.6: Verify + commit**

```bash
pnpm --filter @mynah/app typecheck
```

Expected: clean (builds against new scope). If any `@advocate/` import slipped through, fix and re-typecheck.

```bash
pnpm lint
```

Expected: no new errors.

```bash
git add package.json packages/engine/package.json packages/app/package.json pnpm-lock.yaml \
        packages/engine/src/ packages/app/src/ packages/app/tests/
git commit -m "refactor: rename @advocate/* packages to @mynah/*"
```

---

## Task 2: Docker infrastructure + DB identity

**Files:**
- Modify: `docker-compose.yml`
- Modify: `packages/app/Dockerfile`

**Warning:** This drops the Postgres volume. Ensure stack is DOWN before starting.

- [ ] **Step 2.1: Tear down stack (safety)**

```bash
docker compose down
```

- [ ] **Step 2.2: Update `docker-compose.yml`**

Apply these changes in order:

1. Service renames are optional (service keys like `postgres`, `api`, `worker` stay — generic names). Change only the `container_name:` values:
   - `container_name: advocate-postgres` → `container_name: mynah-postgres`
   - `container_name: advocate-redis` → `container_name: mynah-redis`
   - `container_name: advocate-api` → `container_name: mynah-api`
   - `container_name: advocate-worker` → `container_name: mynah-worker`

2. DB credentials in the `postgres` service:
   - `POSTGRES_DB: advocate` → `POSTGRES_DB: mynah`
   - `POSTGRES_USER: advocate` → `POSTGRES_USER: mynah`
   - `POSTGRES_PASSWORD: advocate` → `POSTGRES_PASSWORD: mynah`
   - `test: ["CMD", "pg_isready", "-U", "advocate"]` → `test: ["CMD", "pg_isready", "-U", "mynah"]`

3. DATABASE_URL in both `api` and `worker` services:
   - `postgresql://advocate:advocate@postgres:5432/advocate` → `postgresql://mynah:mynah@postgres:5432/mynah`

4. Volume rename at the bottom:
   - `pgdata:` → `mynah-pgdata:` (or keep `pgdata:` — see below)

   **Recommendation:** Leave the volume key `pgdata:` unchanged (simpler), but you MUST add `volumes:` clause to rename the internal Docker volume to force a fresh DB:

   ```yaml
   volumes:
     pgdata:
       name: mynah-pgdata
     redisdata:
       name: mynah-redisdata
   ```

   This tells Docker to create volumes called `mynah-pgdata` / `mynah-redisdata` instead of the default composite `advocate_pgdata`. Old `advocate_pgdata` volume remains untouched (you can `docker volume rm` it manually once you're confident the rename succeeded).

- [ ] **Step 2.3: Update `packages/app/Dockerfile`**

- The non-root user block:
  ```dockerfile
  RUN addgroup -S advocate -g 1001 && \
      adduser -S advocate -u 1001 -G advocate
  ```
  becomes:
  ```dockerfile
  RUN addgroup -S mynah -g 1001 && \
      adduser -S mynah -u 1001 -G mynah
  ```
- `RUN chown -R advocate:advocate /app` → `RUN chown -R mynah:mynah /app`
- `USER advocate` → `USER mynah`

- [ ] **Step 2.4: Commit**

```bash
git add docker-compose.yml packages/app/Dockerfile
git commit -m "refactor(docker): rename container + DB identity to mynah"
```

---

## Task 3: Env + source strings + docs

**Files:**
- Modify: `.env.example`
- Modify: `.env` (local, NOT committed)
- Modify: logger component strings in `packages/app/src/**`
- Modify: `README.md`
- Modify: `.claude/CLAUDE.md`
- Modify: `docs/plans/README.md` (top-line references only)

- [ ] **Step 3.1: `.env.example`**

- `DATABASE_URL=postgresql://advocate:advocate@localhost:36432/advocate` → `postgresql://mynah:mynah@localhost:36432/mynah`
- Any comment mentioning "Advocate" in heading → "Mynah"

- [ ] **Step 3.2: `.env` (local dev)**

Same DATABASE_URL change as 3.1. This file is gitignored so the change won't show up in diff.

- [ ] **Step 3.3: Logger component strings**

Grep for hardcoded `'advocate'` strings (lowercase) inside `packages/app/src/**/*.ts`. These are typically pino child logger names like `childLogger('advocate.foo')`. Change to `mynah.foo`. Most logger components today use sub-module names (`auth.keycloak`, `queue`, etc.) so this pass may be nearly empty — verify anyway.

Also check `packages/engine/src/index.ts` and `packages/app/src/index.ts` for banner strings or version exports that mention "Advocate".

- [ ] **Step 3.4: `README.md`**

Replace prose references to "Advocate" with "Mynah". If the README has a header like `# Advocate`, change to `# Mynah`. Update the one-line tagline if it mentions "advocate". Leave commit-history references alone.

- [ ] **Step 3.5: `.claude/CLAUDE.md`**

Edit the project-level instructions:
- Title/header: `# Advocate — Project Documentation` → `# Mynah — Project Documentation`
- Overview sentence: `Advocate is an agentic AI service...` → `Mynah is an agentic AI service...`
- Package names: `@advocate/engine` → `@mynah/engine`, `@advocate/app` → `@mynah/app`

Do NOT change the "Original vision docs (Crawlex/Foreman examples)" reference — that's unrelated.

- [ ] **Step 3.6: `docs/plans/README.md`**

Replace the top H1 `# Advocate Implementation Plans` → `# Mynah Implementation Plans`. The table entries mentioning "Advocate" can be flipped to "Mynah" if concise — skip if the phrasing is awkward. Prefer minimal change.

- [ ] **Step 3.7: Commit**

```bash
git add .env.example README.md .claude/CLAUDE.md docs/plans/README.md packages/app/src/ packages/engine/src/
git commit -m "refactor: flip user-facing docs + logger strings to mynah"
```

---

## Task 4: Verification + tag

- [ ] **Step 4.1: Typecheck + unit tests**

```bash
pnpm --filter @mynah/app typecheck
pnpm --filter @mynah/app test auth
pnpm --filter @mynah/app test bullmq-scheduler
```

All three must pass. (Integration tests that depend on DB skip until stack boots.)

- [ ] **Step 4.2: Docker full-stack boot**

```bash
docker compose up -d --build
```

Wait for healthchecks. Expected: `mynah-postgres`, `mynah-redis`, `mynah-api`, `mynah-worker` all healthy.

- [ ] **Step 4.3: Migrate + round-trip**

The app container runs `node dist/db/migrate.js` on entry — migrations apply automatically against the fresh `mynah` DB.

Fetch token + hit protected route:

```bash
TOKEN=$(curl -s -X POST "http://localhost:9080/realms/mynah/protocol/openid-connect/token" \
  -d "client_id=mynah-dashboard&grant_type=password&username=owner&password=Mynah-Dev-2026!" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))")

curl -sS -o /dev/null -w "health: %{http_code}\n" http://localhost:36401/health
curl -sS -o /dev/null -w "no-token: %{http_code}\n" http://localhost:36401/products
curl -sS -o /dev/null -w "token: %{http_code}\n" -H "Authorization: Bearer $TOKEN" http://localhost:36401/products
```

Expected: `health: 200`, `no-token: 401`, `token: 200` (with empty `[]` body — fresh DB).

- [ ] **Step 4.4: Tag + push**

```bash
docker compose down
git tag -a rename-complete -m "Advocate → Mynah rename complete: packages, Docker, DB, docs"
git push origin master
git push origin rename-complete
```

- [ ] **Step 4.5: Manual post-steps (owner)**

These are outside the plan's automation — you do them after Plan R lands:

1. Rename the GitHub repo: `artyomsv/advocate` → `artyomsv/mynah` via GitHub UI. Push still works until you rename; after rename, update local remote:
   ```bash
   git remote set-url origin https://github.com/artyomsv/mynah.git
   ```
2. Rename the working directory: `E:/Projects/Stukans/advocate` → `E:/Projects/Stukans/mynah`. File Explorer or `mv`. Re-open in IDE.
3. Drop the old Docker volume once confident:
   ```bash
   docker volume rm advocate_pgdata advocate_redisdata
   ```
4. Update `PROJECTS.md` in the shared monorepo if it tracks "advocate" as a project name.

---

## Acceptance Criteria

1. ✅ All 3 `package.json` files use `@mynah/*` scope
2. ✅ Every `from '@advocate/engine'` replaced with `from '@mynah/engine'` (0 occurrences in `packages/**/*.ts`)
3. ✅ Docker containers boot as `mynah-{postgres,redis,api,worker}`
4. ✅ DB user `mynah` owns a fresh `mynah` database
5. ✅ `.env.example` + `.env` use `postgresql://mynah:mynah@…/mynah`
6. ✅ CLAUDE.md + README flip to Mynah
7. ✅ Full Docker round-trip: health 200, no-token 401, valid-token 200
8. ✅ Tag `rename-complete` pushed

## Out of Scope

- GitHub repo rename (manual)
- Working directory rename (manual)
- Historical `docs/plans/*.md` files — left as snapshot
- Postgres volume cleanup (`docker volume rm`) — manual safety step
- `docs/reference/*` and `docs/architecture.md` — untouched; freeze with original terminology

---

**End of Plan R (Advocate → Mynah rename).**
