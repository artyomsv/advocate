# DB integration tests leak state across suites

| Field | Value |
|-------|-------|
| Criticality | High |
| Complexity | Medium |
| Location | `packages/app/tests/**` (legend-accounts, legends, content-plans, orchestrator) |
| Found during | Plan 11.5 verification — ran full `pnpm --filter @mynah/app test` |
| Date | 2026-04-17 |

## Issue

When the full app test suite runs, integration suites fail with FK constraint
errors (e.g. `legend_credentials_legend_account_id_legend_accounts_id_fk`)
and stale-row assertions. Running the same files in isolation passes (e.g.
`vitest run tests/legends/legend.service.test.ts` → 10/10). The new
`tests/engine-stores/*` files all pass in-suite AND in isolation — they
use prefixed-name cleanup, which the older suites don't.

Specific repeatedly failing cases:
- `credential.service.test.ts` — rotate/reveal/revoke/list + preserve-metadata
- `account.service.test.ts` — remove account, record product mention
- `legend.service.test.ts` — create stores and returns a valid legend
- `content-plan.service.test.ts` — throws on IllegalStatusTransitionError
- `orchestrator.service.test.ts` — campaign lead rejects
- `llm/google.integration.test.ts` — real-API latency flake (separate concern)

## Risks

CI will be flakey / unreliable as we grow the test suite. Developers will
learn to ignore red — classic broken-windows — and real regressions will
slip through. Blocks any future enforcement of "full test suite must pass
before merge."

## Suggested Solutions

1. **Transactional test wrapper** — wrap each `it()` in a Drizzle transaction
   that rolls back after the test. Prevents cross-suite leakage entirely.
   Trade-off: requires refactoring every integration test.
2. **Unique prefix + beforeEach cleanup pattern** (as engine-stores tests do).
   Cheaper per-file but easy to forget; relies on discipline.
3. **Split test DB per suite** — use schema-per-file via `TESTDB_SCHEMA=...`
   and CREATE SCHEMA in setup. Slowest, cleanest.

Recommend option 1 — transactional wrapper — since it scales.

Skip `google.integration.test.ts` when no real `GOOGLE_AI_API_KEY` credit
is available; it's orthogonal to the pollution issue.
