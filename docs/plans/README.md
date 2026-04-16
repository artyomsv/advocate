# Advocate Implementation Plans

Sequential plans for building Advocate. Each plan produces working, testable software on its own.

## Roadmap

| # | Plan | Status | File |
|---|---|---|---|
| 01 | Foundation — monorepo, tooling, Docker, credentials, health check | ✅ Complete (tag `plan01-complete`) | [2026-04-16-01-foundation.md](2026-04-16-01-foundation.md) |
| 02 | Database Schema — all Drizzle tables + migrations | ✅ Complete (tag `plan02-complete`) | [2026-04-16-02-database-schema.md](2026-04-16-02-database-schema.md) |
| 02.5 | App Dockerization — Dockerfile + compose service + migration-on-boot | ✅ Complete (tag `plan02.5-complete`) | [2026-04-16-02.5-app-dockerization.md](2026-04-16-02.5-app-dockerization.md) |
| 03 | Engine: Core Abstractions — Agent, Role, Runtime, Hierarchy | ✅ Complete (tag `plan03-complete`) | [2026-04-16-03-engine-core.md](2026-04-16-03-engine-core.md) |
| 04 | Engine: Memory + Tasks — episodic, relational, kanban | ✅ Complete (tag `plan04-complete`) | [2026-04-16-04-engine-memory-tasks.md](2026-04-16-04-engine-memory-tasks.md) |
| 05 | Engine: Messaging + Heartbeat — bus, log, cron, events | 🟡 Ready for execution | [2026-04-16-05-engine-messaging-heartbeat.md](2026-04-16-05-engine-messaging-heartbeat.md) |
| 06 | Engine: LLM Router — provider interface + 3 providers | ⚪ Not yet written | — |
| 07 | Engine: Notifications + Storage — Telegram, storage interfaces | ⚪ Not yet written | — |
| 08 | App: Products + Legends — schemas + CRUD + account mgmt | ⚪ Not yet written | — |
| 09 | App: Three-Layer Prompts — soul, product knowledge, context | ⚪ Not yet written | — |
| 10 | App: Platform Adapters — Manual + Reddit | ⚪ Not yet written | — |
| 11 | App: Agents — Campaign Lead, Strategist, Scout, etc. | ⚪ Not yet written | — |
| 12 | App: API + Auth — Fastify routes + Keycloak JWT | ⚪ Not yet written | — |
| 13 | Dashboard: Shell + Auth — React + shadcn/ui + Keycloak SPA | ⚪ Not yet written | — |
| 14 | Dashboard: Content + Kanban — approval queue + task board | ⚪ Not yet written | — |
| 15 | Dashboard: Legends + Analytics + LLM Center | ⚪ Not yet written | — |
| 16 | Telegram Integration — bot + approval flow | ⚪ Not yet written | — |
| 17 | E2E Campaign Flow — full integration test | ⚪ Not yet written | — |

## Execution

Each plan is designed to be executed by an autonomous agent following either:
- **superpowers:subagent-driven-development** (recommended) — fresh subagent per task with review gates
- **superpowers:executing-plans** — inline batch execution with checkpoints

## Conventions

- TDD — tests first, then implementation
- Frequent commits — commit at task boundaries
- No placeholders — every step shows actual code
- Acceptance criteria at the end of each plan
