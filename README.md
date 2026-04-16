# Advocate

Agentic AI service for organic community promotion. Multi-agent system that builds authentic community presence across social platforms.

## Packages

- **`@advocate/engine`** — Reusable multi-agent orchestration core (SOLID, domain-agnostic)
- **`@advocate/app`** — Social promotion application built on the engine

## Prerequisites

- Node.js 22 LTS
- pnpm 10+
- Docker Desktop

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment template and fill in values
cp .env.example .env

# Generate a credential master key (32 bytes as hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Paste the output into .env as CREDENTIAL_MASTER_KEY

# Start Postgres and Redis
docker compose up -d
```

## Development

```bash
# Start the API with hot reload
pnpm --filter @advocate/app dev

# In another terminal, verify it's running
curl http://localhost:36401/health
```

Expected `/health` response when everything is up:

```json
{"status":"ok","checks":{"database":true,"redis":true}}
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm lint` | Lint with Biome |
| `pnpm lint:fix` | Auto-fix lint issues |
| `pnpm typecheck` | TypeScript type check |
| `pnpm verify` | Lint + typecheck + test (CI-equivalent) |

## Ports (364xx range)

| Service | Host Port |
|---|---|
| API | 36401 |
| Dashboard | 36400 (Plan 13) |
| Postgres | 36432 |
| Redis | 36479 |
| Bull Board | 36473 (Plan 05) |
| Keycloak | 9080 (shared instance, external) |

## Documentation

- Consolidated architecture: `docs/architecture.md`
- Implementation plans: `docs/plans/`
- Reference material (original vision, campaign playbooks): `docs/reference/`
- Project memory / conventions: `.claude/CLAUDE.md`

## Branch Convention

Primary branch is `master` (project owner preference). Every task-boundary commit is a checkpoint; tags `plan01-batch-<X>-done` mark batch completions.
