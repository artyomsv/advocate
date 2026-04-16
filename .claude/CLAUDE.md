# Advocate — Project Documentation

## Overview

Advocate is an agentic AI service for organic community promotion. Two packages in a pnpm monorepo:
- `@advocate/engine` — reusable multi-agent orchestration engine (SOLID, product-agnostic)
- `@advocate/app` — social promotion application built on the engine

First product to promote: **Fairy Book Store** (fairybookstore.com).

## Architecture

Full architecture: `docs/architecture.md`
Original vision docs (Crawlex/Foreman examples): `docs/reference/`

## Tech Stack

- **Language**: TypeScript (strict, ESM)
- **Runtime**: Node.js 22 LTS
- **Package Manager**: pnpm + Turborepo
- **Linting**: Biome
- **API**: Fastify 5
- **ORM**: Drizzle ORM (PostgreSQL 17)
- **Queue**: BullMQ + Redis 7
- **LLM**: Multi-provider (Anthropic, Google, OpenAI, DeepSeek stub, Qwen stub)
- **Frontend**: React 19 + Vite 6 + Tailwind 4 + shadcn/ui
- **State**: TanStack Query (server) + Zustand (client)
- **Auth**: Keycloak (existing shared instance at port 9080)
- **Notifications**: Telegram (grammy)
- **Testing**: Vitest + Playwright
- **Logging**: Pino

## Port Allocation (364xx range)

| Service | Host Port |
|---|---|
| Dashboard | 36400 |
| API | 36401 |
| PostgreSQL | 36432 |
| Redis | 36479 |
| Bull Board | 36473 |
| Keycloak | 9080 (shared) |

## Code Conventions

- 2-space indentation (TypeScript/JSON/YAML)
- Use `interface` over `type` for object shapes
- Pure ESM — no CommonJS
- Biome for formatting and linting
- SOLID principles enforced in engine package
- Engine has zero domain knowledge — all social/marketing logic in app package

## Commands

```bash
# Install dependencies
pnpm install

# Dev (all services)
docker compose up -d postgres redis
pnpm dev

# Test
pnpm test

# Lint
pnpm lint

# Build
pnpm build

# Database
pnpm --filter @advocate/app db:generate   # Generate migrations
pnpm --filter @advocate/app db:migrate    # Run migrations
pnpm --filter @advocate/app db:studio     # Drizzle Studio
```

## Key Architectural Decisions

1. **Two packages**: engine (reusable) + app (domain-specific)
2. **Agent hierarchy**: Campaign Lead → Strategist/Scout/Analytics, with human override via Telegram
3. **Three-layer prompts**: Soul (identity) + Product Knowledge (filtered) + Context (dynamic)
4. **Multi-LLM routing**: task-based model selection with quality-based auto-escalation
5. **Legends manually created**: owner orchestrates identity creation, not auto-generated
6. **Accounts manually created**: Gmail/Outlook/Proton created by owner, system tracks them
7. **No proxy/VPN**: Phase 1 operates without IP rotation
8. **Credential encryption**: AES-256-GCM with env var master key

## Environment Variables

See `.env.example` for full list. Key ones:
- `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY` — LLM providers
- `CREDENTIAL_MASTER_KEY` — 32-byte hex for credential encryption
- `KEYCLOAK_URL`, `KEYCLOAK_REALM` — auth
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID` — notifications
- `LLM_MONTHLY_BUDGET_CENTS` — default 2000 ($20)
