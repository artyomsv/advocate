# Dashboard Legends + LLM Center (Plan 15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Add two dashboard pages that read existing backend state — `/legends` (list + detail drawer) and `/llm` (active providers + budget). Tag `plan15-complete`.

**Scope narrowed vs roadmap:** The original roadmap said "Legends + Analytics + LLM Center." Analytics requires campaign/post metrics that don't exist in any schema yet. Ship legends + LLM config here; analytics becomes its own plan once campaign execution (posting + feedback) lands.

**Architecture:** Frontend-only plan. Adds a `/llm/status` API endpoint (new, tiny — returns active providers + budget from env) + two React pages. No new DB tables. No writes.

**Tech Stack:** existing (Fastify, React, TanStack Query, shadcn Card/Badge).

**Prerequisites:**
- Plan 14 complete (tag `plan14-complete`)

---

## File Structure Overview

```
packages/app/src/server/routes/
└── llm.ts                              # NEW — GET /llm/status

packages/app/src/server/server.ts       # MODIFY — register route

packages/dashboard/src/
├── hooks/
│   ├── useLegends.ts                   # NEW
│   └── useLlmStatus.ts                 # NEW
└── routes/pages/
    ├── Legends.tsx                     # NEW
    └── LlmCenter.tsx                   # NEW

packages/dashboard/src/routes/router.tsx   # MODIFY — add /legends + /llm
packages/dashboard/src/components/shell/Sidebar.tsx  # MODIFY — add "LLM" entry
```

---

## Task 1: `/llm/status` backend endpoint

**Files:**
- Create: `packages/app/src/server/routes/llm.ts`
- Modify: `packages/app/src/server/server.ts`

- [ ] **Step 1.1: `packages/app/src/server/routes/llm.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { getEnv } from '../../config/env.js';
import { createDefaultRouter } from '../../llm/default-router.js';

export interface LlmStatus {
  mode: string;
  monthlyBudgetCents: number;
  activeProviders: readonly string[];
  routes: readonly string[];
}

export async function registerLlmRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/llm/status',
    { preHandler: [app.authenticate] },
    async (): Promise<LlmStatus> => {
      const env = getEnv();
      const { activeProviders, routeKeys } = createDefaultRouter({ env });
      return {
        mode: env.LLM_DEFAULT_MODE,
        monthlyBudgetCents: env.LLM_MONTHLY_BUDGET_CENTS,
        activeProviders,
        routes: routeKeys,
      };
    },
  );
}
```

- [ ] **Step 1.2: Register in `server.ts`**

Add `import { registerLlmRoutes }` and `await registerLlmRoutes(app);` (matching existing pattern).

- [ ] **Step 1.3: Typecheck + commit**

```bash
pnpm --filter @mynah/app typecheck
git add packages/app/src/server/routes/llm.ts packages/app/src/server/server.ts
git commit -m "feat(app): add GET /llm/status route (providers + budget)"
```

---

## Task 2: Dashboard hooks + pages

**Files:** all new under `packages/dashboard/src/`.

- [ ] **Step 2.1: `hooks/useLegends.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface Legend {
  id: string;
  productId: string;
  firstName: string;
  lastName: string;
  gender: string;
  age: number;
  location: { city: string; state: string; country: string; timezone: string };
  professional: { occupation: string; company: string; industry: string };
  hobbies: string[];
  expertiseAreas: string[];
  maturity: string;
  createdAt: string;
}

export function useLegends() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['legends'],
    queryFn: () => api<Legend[]>('/legends', { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 2.2: `hooks/useLlmStatus.ts`**

```typescript
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface LlmStatus {
  mode: string;
  monthlyBudgetCents: number;
  activeProviders: string[];
  routes: string[];
}

export function useLlmStatus() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['llm-status'],
    queryFn: () => api<LlmStatus>('/llm/status', { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 2.3: `routes/pages/Legends.tsx`**

```tsx
import type { JSX } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useLegends } from '../../hooks/useLegends';

export function Legends(): JSX.Element {
  const q = useLegends();
  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Legends</h1>
        <Badge>{items.length}</Badge>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-slate-400">No legends created yet.</CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {l.firstName} {l.lastName}
                </CardTitle>
                <Badge tone="warn">{l.maturity}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>
                {l.professional.occupation} at {l.professional.company} · {l.age} · {l.gender}
              </div>
              <div className="text-xs text-slate-400">
                {l.location.city}, {l.location.country} · {l.location.timezone}
              </div>
              <div className="flex flex-wrap gap-1">
                {l.expertiseAreas.slice(0, 5).map((e) => (
                  <Badge key={e}>{e}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2.4: `routes/pages/LlmCenter.tsx`**

```tsx
import type { JSX } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useLlmStatus } from '../../hooks/useLlmStatus';

export function LlmCenter(): JSX.Element {
  const q = useLlmStatus();
  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const s = q.data;
  if (!s) return <div className="p-4 text-slate-400">No status</div>;

  const budgetDollars = (s.monthlyBudgetCents / 100).toFixed(2);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">LLM Center</h1>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Mode:</span>
            <Badge tone="success">{s.mode}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Monthly budget:</span>
            <Badge>${budgetDollars}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active providers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {s.activeProviders.map((p) => (
              <Badge key={p} tone="success">
                {p}
              </Badge>
            ))}
            {s.activeProviders.length === 0 && (
              <span className="text-sm text-slate-400">None — all routes fall through to stub.</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered routes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {s.routes.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">
          Per-call usage is not yet persisted. Will populate once Plan 11.5
          (engine store persistence) lands.
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2.5: Wire routes + sidebar**

`routes/router.tsx` — add imports + route entries:

```tsx
import { Legends } from './pages/Legends';
import { LlmCenter } from './pages/LlmCenter';
// ... in children:
{ path: 'legends', element: <Legends /> },
{ path: 'llm', element: <LlmCenter /> },
```

(Remove the `ComingSoon` on `/legends`.)

`components/shell/Sidebar.tsx` — update NAV:

```typescript
const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'Queue' },
  { to: '/legends', label: 'Legends' },
  { to: '/llm', label: 'LLM' },
] as const;
```

- [ ] **Step 2.6: Build + commit**

```bash
pnpm --filter @mynah/dashboard typecheck
pnpm --filter @mynah/dashboard build

git add packages/dashboard
git commit -m "feat(dashboard): Legends page + LLM Center page"
```

---

## Task 3: Docker verify + tag

- [ ] **Step 3.1: Full stack boot**

```bash
docker compose up -d --build
```

Wait for all 5 healthy.

- [ ] **Step 3.2: API spot-check**

```bash
TOKEN=$(curl -s -X POST "http://localhost:9080/realms/mynah/protocol/openid-connect/token" \
  -d "client_id=mynah-dashboard&grant_type=password&username=owner&password=Mynah-Dev-2026!" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).access_token))")
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:36401/llm/status
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:36401/legends | head -c 200
```

Expected: `/llm/status` returns `{mode, monthlyBudgetCents, activeProviders, routes}`. `/legends` returns an array (may be empty).

- [ ] **Step 3.3: Dashboard serves**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:36400/legends
curl -sS -o /dev/null -w "%{http_code}\n" http://localhost:36400/llm
```

Both 200 (SPA fallback).

- [ ] **Step 3.4: Tear down + tag**

```bash
docker compose down
git tag -a plan15-complete -m "Plan 15 (Legends + LLM Center) complete — two read-only dashboard pages"
git push origin master
git push origin plan15-complete
```

- [ ] **Step 3.5: README**

Update Plan 15 row to complete. Commit + push.

---

## Acceptance Criteria

1. ✅ `GET /llm/status` returns mode + budget + providers + routes (auth-required)
2. ✅ `/legends` dashboard page lists legends with name, occupation, maturity badge
3. ✅ `/llm` dashboard page shows mode, budget, active providers, routes, spend placeholder
4. ✅ Sidebar nav has Dashboard / Queue / Legends / LLM
5. ✅ Tag `plan15-complete` pushed

## Out of Scope

- **Analytics** (campaign metrics, content performance) — deferred until posts/feedback data exists
- **Legend CRUD from dashboard** — read-only for this plan
- **Per-call spend stats** — needs Plan 11.5 persistence
- **Model escalation UI** (manual pick model per task) — separate plan

---

**End of Plan 15.**
