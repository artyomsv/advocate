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
| 05 | Engine: Messaging + Heartbeat — bus, log, cron, events | ✅ Complete (tag `plan05-complete`) | [2026-04-16-05-engine-messaging-heartbeat.md](2026-04-16-05-engine-messaging-heartbeat.md) |
| 06 | Engine: LLM Router — interface + router + budget + stub | ✅ Complete (tag `plan06-complete`) | [2026-04-16-06-engine-llm-router.md](2026-04-16-06-engine-llm-router.md) |
| 06.5 | App: Concrete LLM providers — Anthropic, Google, OpenAI | ✅ Complete (tag `plan06.5-complete`) | [2026-04-16-06.5-app-llm-providers.md](2026-04-16-06.5-app-llm-providers.md) |
| 07 | Notifications — send-only sender + Telegram notifier | ✅ Complete (tag `plan07-complete`) | [2026-04-16-07-notifications.md](2026-04-16-07-notifications.md) |
| 08 | App: Products + Legends — Drizzle repos + services + Fastify CRUD routes | ✅ Complete (tag `plan08-complete`) | [2026-04-16-08-products-legends.md](2026-04-16-08-products-legends.md) |
| 08.5 | App: Legend accounts + credentials — warm-up transitions + AES-GCM encryption | ✅ Complete (tag `plan08.5-complete`) | [2026-04-16-08.5-legend-accounts-credentials.md](2026-04-16-08.5-legend-accounts-credentials.md) |
| 09 | App: Three-Layer Prompts — Soul + Product Knowledge + Context composer | ✅ Complete (tag `plan09-complete`) | [2026-04-16-09-three-layer-prompts.md](2026-04-16-09-three-layer-prompts.md) |
| 10 | App: Platform Adapters — Manual (full) + Reddit (stub) | ✅ Complete (tag `plan10-complete`) | [2026-04-16-10-platform-adapters.md](2026-04-16-10-platform-adapters.md) |
| 10.5 | App: Reddit adapter real implementation — OAuth + rate limiting | ⚪ Deferred until credentials available | — |
| 11a | App: Content Writer agent — first agent end-to-end + `/agents/content-writer/draft` | ✅ Complete (tag `plan11a-complete`) | [2026-04-16-11a-content-writer-agent.md](2026-04-16-11a-content-writer-agent.md) |
| 11b | App: Gate agents — Quality Gate (LLM review) + Safety Worker (rules) | ✅ Complete (tag `plan11b-complete`) | [2026-04-16-11b-gate-agents.md](2026-04-16-11b-gate-agents.md) |
| 11c | App: Orchestrator agents — Strategist + Campaign Lead | ✅ Complete (tag `plan11c-complete`) | [2026-04-16-11c-orchestrator-agents.md](2026-04-16-11c-orchestrator-agents.md) |
| 11d | App: Orchestrator pipeline — compose 5 agents → persisted content_plan | ✅ Complete (tag `plan11d-complete`) | [2026-04-16-11d-orchestrator-pipeline.md](2026-04-16-11d-orchestrator-pipeline.md) |
| 11e | App: BullMQ autonomy — worker process + cron schedules | ✅ Complete (tag `plan11e-complete`) | [2026-04-16-11e-bullmq-autonomy.md](2026-04-16-11e-bullmq-autonomy.md) |
| 11.5 | Engine store persistence — Drizzle impls for memory/tasks/messages/budget | ⚪ Deferred | — |
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
