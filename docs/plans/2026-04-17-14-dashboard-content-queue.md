# Dashboard Content Approval Queue (Plan 14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Expose the content-plan backend as HTTP routes, and ship the first real dashboard page — a review queue where the owner approves or rejects `status=review` content plans.

**Architecture:** Four Fastify routes (list, get, approve, reject) on top of the existing `ContentPlanRepository`. React side uses shadcn/ui primitives (Table, Card, Badge, Button, Dialog) — installed on demand, not preemptively. TanStack Query handles the list + mutations. No optimistic updates in this plan.

**Kanban-over-tasks deferred:** The roadmap said "approval queue + task board". Task persistence is Plan 11.5 (deferred). Doing an in-memory kanban over the engine's task interface would invite churn when persistence lands. Ship the approval queue now; the task kanban follows when Plan 11.5 ships.

**Tech Stack:** Fastify 5 (existing) · shadcn/ui (install button/card/badge/dialog/table) · TanStack Query 5 (existing)

**Prerequisites:**
- Plan 13 complete (tag `plan13-complete`)
- Realm `mynah` in shared Keycloak

---

## File Structure Overview

```
packages/app/src/content-plans/
├── content-plan.service.ts           # NEW — approve/reject transitions + status guards
└── errors.ts                         # NEW — NotFound, IllegalStatus

packages/app/src/server/routes/
└── content-plans.ts                  # NEW

packages/app/src/server/server.ts     # MODIFY — register route

packages/app/tests/content-plans/
└── content-plan.service.test.ts      # integration

packages/dashboard/src/
├── components/ui/                    # shadcn-generated (button, card, badge, dialog, table)
├── routes/pages/
│   ├── ContentQueue.tsx              # NEW
│   └── ContentDetail.tsx             # NEW (drawer/dialog)
└── routes/router.tsx                 # MODIFY — /content route

packages/dashboard/tests/
└── routes/ContentQueue.test.tsx      # renders list from mocked query
```

---

## Task 1: Backend — content-plan service + routes

**Files:**
- Create: `packages/app/src/content-plans/content-plan.service.ts`
- Create: `packages/app/src/content-plans/errors.ts`
- Create: `packages/app/src/server/routes/content-plans.ts`
- Modify: `packages/app/src/server/server.ts`
- Create: `packages/app/tests/content-plans/content-plan.service.test.ts`

- [ ] **Step 1.1: `errors.ts`**

```typescript
export class ContentPlanNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Content plan ${id} not found`);
    this.name = 'ContentPlanNotFoundError';
  }
}

export class IllegalStatusTransitionError extends Error {
  constructor(
    public readonly id: string,
    public readonly from: string,
    public readonly to: string,
  ) {
    super(`Content plan ${id} cannot transition from ${from} to ${to}`);
    this.name = 'IllegalStatusTransitionError';
  }
}
```

- [ ] **Step 1.2: `content-plan.service.ts`**

```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { ContentPlan } from '../db/schema.js';
import type * as schema from '../db/schema.js';
import { ContentPlanRepository } from './content-plan.repository.js';
import {
  ContentPlanNotFoundError,
  IllegalStatusTransitionError,
} from './errors.js';

export class ContentPlanService {
  readonly #repo: ContentPlanRepository;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#repo = new ContentPlanRepository(db);
  }

  listByStatus(
    status: ContentPlan['status'],
    filter?: { legendId?: string },
  ): Promise<readonly ContentPlan[]> {
    return this.#repo.listByStatus(status, filter).then((rows) => [...rows]);
  }

  async get(id: string): Promise<ContentPlan> {
    const row = await this.#repo.findById(id);
    if (!row) throw new ContentPlanNotFoundError(id);
    return row;
  }

  async approve(id: string): Promise<ContentPlan> {
    return this.#transition(id, 'review', 'approved');
  }

  async reject(id: string): Promise<ContentPlan> {
    return this.#transition(id, 'review', 'rejected');
  }

  async #transition(
    id: string,
    from: ContentPlan['status'],
    to: ContentPlan['status'],
  ): Promise<ContentPlan> {
    const current = await this.#repo.findById(id);
    if (!current) throw new ContentPlanNotFoundError(id);
    if (current.status !== from) {
      throw new IllegalStatusTransitionError(id, current.status, to);
    }
    const updated = await this.#repo.update(id, { status: to });
    if (!updated) throw new ContentPlanNotFoundError(id);
    return updated;
  }
}
```

- [ ] **Step 1.3: `routes/content-plans.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { ContentPlanService } from '../../content-plans/content-plan.service.js';
import {
  ContentPlanNotFoundError,
  IllegalStatusTransitionError,
} from '../../content-plans/errors.js';
import type { ContentPlan } from '../../db/schema.js';

const listQuery = z.object({
  status: z
    .enum(['planned', 'generating', 'review', 'approved', 'rejected', 'posted', 'failed'])
    .default('review'),
  legendId: z.string().uuid().optional(),
});

export async function registerContentPlanRoutes(app: FastifyInstance): Promise<void> {
  const service = new ContentPlanService(getDb());

  app.get(
    '/content-plans',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = listQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      return service.listByStatus(
        parsed.data.status as ContentPlan['status'],
        parsed.data.legendId ? { legendId: parsed.data.legendId } : undefined,
      );
    },
  );

  app.get<{ Params: { id: string } }>(
    '/content-plans/:id',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      try {
        return await service.get(req.params.id);
      } catch (err) {
        if (err instanceof ContentPlanNotFoundError) {
          return reply.code(404).send({ error: 'NotFound', id: req.params.id });
        }
        throw err;
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/content-plans/:id/approve',
    { preHandler: [app.authenticate] },
    async (req, reply) => handleTransition(reply, () => service.approve(req.params.id)),
  );

  app.post<{ Params: { id: string } }>(
    '/content-plans/:id/reject',
    { preHandler: [app.authenticate] },
    async (req, reply) => handleTransition(reply, () => service.reject(req.params.id)),
  );
}

async function handleTransition(
  reply: Parameters<Parameters<FastifyInstance['post']>[2]>[1],
  op: () => Promise<unknown>,
): Promise<unknown> {
  try {
    return await op();
  } catch (err) {
    if (err instanceof ContentPlanNotFoundError) {
      return reply.code(404).send({ error: 'NotFound' });
    }
    if (err instanceof IllegalStatusTransitionError) {
      return reply.code(409).send({ error: 'IllegalStatus', from: err.from, to: err.to });
    }
    throw err;
  }
}
```

- [ ] **Step 1.4: Register in `server.ts`**

Add:
```typescript
import { registerContentPlanRoutes } from './routes/content-plans.js';
// ... inside buildServer(), after other registrations:
await registerContentPlanRoutes(app);
```

- [ ] **Step 1.5: Integration test**

`packages/app/tests/content-plans/content-plan.service.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { ContentPlanService } from '../../src/content-plans/content-plan.service.js';
import {
  ContentPlanNotFoundError,
  IllegalStatusTransitionError,
} from '../../src/content-plans/errors.js';
import { closeDb, getDb } from '../../src/db/connection.js';
import {
  communities,
  contentPlans,
  legendAccounts,
  legends,
  products,
} from '../../src/db/schema.js';

const PREFIX = `canary-cplan-svc-${Date.now()}-`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(contentPlans).where(like(contentPlans.intent, `${PREFIX}%`));
  await db.delete(legendAccounts);
  await db.delete(legends);
  await db.delete(communities);
  await db.delete(products);
}

async function seed(): Promise<{ contentPlanId: string }> {
  const db = getDb();
  const [p] = await db
    .insert(products)
    .values({ name: 'P', slug: `${PREFIX}p`, description: 'd' })
    .returning();
  const [l] = await db
    .insert(legends)
    .values({
      productId: p!.id,
      firstName: 'A',
      lastName: 'B',
      gender: 'female',
      age: 30,
      location: { city: 'X', state: 'Y', country: 'Z', timezone: 'UTC' },
      lifeDetails: { maritalStatus: 'single' },
      professional: {
        occupation: 'o',
        company: 'c',
        industry: 'i',
        yearsExperience: 1,
        education: 'e',
      },
      bigFive: { openness: 5, conscientiousness: 5, extraversion: 5, agreeableness: 5, neuroticism: 5 },
      techSavviness: 5,
      typingStyle: {
        capitalization: 'proper',
        punctuation: 'correct',
        commonTypos: [],
        commonPhrases: [],
        avoidedPhrases: [],
        paragraphStyle: 'varied',
        listStyle: 'sometimes',
        usesEmojis: false,
        formality: 5,
      },
      activeHours: { start: 8, end: 22 },
      activeDays: [1, 2, 3, 4, 5],
      averagePostLength: 'short',
      hobbies: ['h'],
      expertiseAreas: ['e'],
      productRelationship: {
        discoveryStory: 'ds',
        usageDuration: '1mo',
        satisfactionLevel: 5,
        complaints: [],
        useCase: 'uc',
        alternativesConsidered: [],
      },
    })
    .returning();
  const [a] = await db
    .insert(legendAccounts)
    .values({
      legendId: l!.id,
      platform: 'reddit',
      username: `${PREFIX}u`,
      status: 'active',
    })
    .returning();
  const [c] = await db
    .insert(communities)
    .values({ platform: 'reddit', identifier: `${PREFIX}c`, name: 'comm', status: 'active' })
    .returning();
  const [cp] = await db
    .insert(contentPlans)
    .values({
      legendId: l!.id,
      legendAccountId: a!.id,
      communityId: c!.id,
      platform: 'reddit',
      contentType: 'value_post',
      promotionLevel: 1,
      intent: `${PREFIX}intent`,
      bodyDraft: 'body',
      status: 'review',
      costMillicents: 0,
    })
    .returning();
  return { contentPlanId: cp!.id };
}

describe('ContentPlanService', () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('approve transitions review → approved', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    const updated = await svc.approve(contentPlanId);
    expect(updated.status).toBe('approved');
  });

  it('reject transitions review → rejected', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    const updated = await svc.reject(contentPlanId);
    expect(updated.status).toBe('rejected');
  });

  it('throws IllegalStatusTransitionError when already approved', async () => {
    const { contentPlanId } = await seed();
    const svc = new ContentPlanService(getDb());
    await svc.approve(contentPlanId);
    await expect(svc.approve(contentPlanId)).rejects.toBeInstanceOf(IllegalStatusTransitionError);
  });

  it('throws NotFound for unknown id', async () => {
    const svc = new ContentPlanService(getDb());
    await expect(svc.get('11111111-1111-4111-8111-111111111111')).rejects.toBeInstanceOf(
      ContentPlanNotFoundError,
    );
  });

  it('listByStatus filters by status', async () => {
    await seed();
    const svc = new ContentPlanService(getDb());
    const rows = await svc.listByStatus('review');
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 1.6: Run + commit**

```bash
docker compose up -d postgres
pnpm --filter @mynah/app test content-plan.service
pnpm --filter @mynah/app typecheck
pnpm lint
```

5/5 tests pass.

```bash
git add packages/app/src/content-plans packages/app/src/server packages/app/tests/content-plans
git commit -m "feat(app): content-plan service + HTTP routes (list/get/approve/reject)"
```

---

## Task 2: Dashboard — install shadcn + data hooks

**Files:**
- Create: `packages/dashboard/components.json`
- Create: `packages/dashboard/src/components/ui/` (shadcn-generated)
- Create: `packages/dashboard/src/hooks/useContentPlans.ts`
- Modify: `packages/dashboard/package.json` (add lucide-react + class-variance-authority)

- [ ] **Step 2.1: Install shadcn deps**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @mynah/dashboard add class-variance-authority lucide-react @radix-ui/react-dialog @radix-ui/react-slot
```

- [ ] **Step 2.2: `packages/dashboard/components.json`**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "tailwind": {
    "config": "",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/cn"
  }
}
```

- [ ] **Step 2.3: Hand-craft minimal shadcn primitives**

Rather than running `pnpm dlx shadcn@latest add button card badge dialog table` (requires interactive auth for the registry), write the minimal files directly.

`packages/dashboard/src/components/ui/button.tsx`:

```tsx
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-slate-100 text-slate-900 hover:bg-white',
        destructive: 'bg-red-600 text-white hover:bg-red-700',
        outline: 'border border-slate-700 text-slate-200 hover:bg-slate-800',
        ghost: 'text-slate-300 hover:bg-slate-800',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3',
        lg: 'h-10 px-6',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
  },
);
Button.displayName = 'Button';
```

`packages/dashboard/src/components/ui/card.tsx`:

```tsx
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded border border-slate-800 bg-slate-900 text-slate-100', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-4', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-lg font-semibold', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-4 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';
```

`packages/dashboard/src/components/ui/badge.tsx`:

```tsx
import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      tone: {
        default: 'bg-slate-800 text-slate-200',
        success: 'bg-green-900 text-green-200',
        warn: 'bg-amber-900 text-amber-100',
        danger: 'bg-red-900 text-red-100',
      },
    },
    defaultVariants: { tone: 'default' },
  },
);

interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps): JSX.Element {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
```

(Skip Table + Dialog primitives for now — Plan 14 uses plain HTML `<table>` + inline approve/reject buttons. Dialog adds complexity not needed for the review queue.)

- [ ] **Step 2.4: Data hook `packages/dashboard/src/hooks/useContentPlans.ts`**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface ContentPlan {
  id: string;
  legendId: string;
  legendAccountId: string;
  communityId: string;
  platform: string;
  contentType: string;
  promotionLevel: number;
  intent: string;
  bodyDraft: string | null;
  status: 'planned' | 'generating' | 'review' | 'approved' | 'rejected' | 'posted' | 'failed';
  costMillicents: number;
  createdAt: string;
  updatedAt: string;
}

export function useContentPlans(status: ContentPlan['status'] = 'review') {
  const token = useApiToken();
  return useQuery({
    queryKey: ['content-plans', status],
    queryFn: () => api<ContentPlan[]>(`/content-plans?status=${status}`, { token }),
    enabled: !!token,
  });
}

export function useContentPlanDecision() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api<ContentPlan>(`/content-plans/${id}/${decision}`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content-plans'] });
    },
  });
}
```

- [ ] **Step 2.5: Commit**

```bash
pnpm --filter @mynah/dashboard typecheck
pnpm --filter @mynah/dashboard build

git add packages/dashboard
git commit -m "feat(dashboard): shadcn primitives (Button, Card, Badge) + content-plan hooks"
```

---

## Task 3: ContentQueue page

**Files:**
- Create: `packages/dashboard/src/routes/pages/ContentQueue.tsx`
- Modify: `packages/dashboard/src/routes/router.tsx`
- Modify: `packages/dashboard/src/components/shell/Sidebar.tsx` — swap "Products" nav for "Queue"

- [ ] **Step 3.1: `ContentQueue.tsx`**

```tsx
import type { JSX } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { type ContentPlan, useContentPlanDecision, useContentPlans } from '../../hooks/useContentPlans';

export function ContentQueue(): JSX.Element {
  const q = useContentPlans('review');
  const mutate = useContentPlanDecision();

  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <Badge tone="default">{items.length} pending</Badge>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-slate-400">No content plans awaiting review.</CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <ContentPlanCard
            key={p.id}
            plan={p}
            onDecide={(decision) =>
              mutate.mutate({ id: p.id, decision })
            }
            busy={mutate.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ContentPlanCard({
  plan,
  onDecide,
  busy,
}: {
  plan: ContentPlan;
  onDecide: (d: 'approve' | 'reject') => void;
  busy: boolean;
}): JSX.Element {
  const cost = (plan.costMillicents / 100_000).toFixed(5);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{plan.intent || '(no intent)'}</CardTitle>
          <div className="flex gap-2">
            <Badge>{plan.contentType}</Badge>
            <Badge tone="warn">L{plan.promotionLevel}</Badge>
            <Badge>{plan.platform}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-300">
          {plan.bodyDraft ?? '(no body)'}
        </pre>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            ${cost} · {new Date(plan.createdAt).toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onDecide('reject')}
            >
              Reject
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onDecide('approve')}>
              Approve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3.2: Add `/queue` route**

Modify `packages/dashboard/src/routes/router.tsx` — import ContentQueue, add route:

```tsx
import { ContentQueue } from './pages/ContentQueue';
// ... in children:
{ path: 'queue', element: <ContentQueue /> },
```

- [ ] **Step 3.3: Update Sidebar nav**

In `Sidebar.tsx` replace the NAV array:

```typescript
const NAV = [
  { to: '/', label: 'Dashboard' },
  { to: '/queue', label: 'Queue' },
  { to: '/legends', label: 'Legends' },
] as const;
```

- [ ] **Step 3.4: Build + commit**

```bash
pnpm --filter @mynah/dashboard typecheck
pnpm --filter @mynah/dashboard build

git add packages/dashboard
git commit -m "feat(dashboard): content review queue page + approve/reject UI"
```

---

## Task 4: Verify + tag

- [ ] **Step 4.1: Full stack**

```bash
docker compose up -d --build
```

Wait for all 5 containers healthy.

- [ ] **Step 4.2: Seed a review-status content plan**

```bash
docker exec mynah-postgres psql -U mynah -d mynah -c "
INSERT INTO products (name, slug, description) VALUES ('Smoke', 'smoke-14', 'smoke') RETURNING id;"
# (note the product id and paste into next statements, or script it)
```

Or seed via existing orchestrator once migrations re-run (fresh DB from Plan R). Easiest: POST /schedules/orchestrate with a 1-minute schedule + wait. Simpler: insert directly:

```bash
docker exec mynah-postgres psql -U mynah -d mynah <<'SQL'
-- Seed minimal product + legend + account + community + content_plan @ review
INSERT INTO products (name, slug, description) VALUES ('Smoke 14', 'smoke-14', 'Smoke product');
-- Use the legend + community from the realm-setup era (adjust as needed).
SQL
```

Skip heavy seeding — Plan 14 verification is "UI renders a list, approve/reject mutates". Test with a hand-crafted row:

```bash
docker exec mynah-postgres psql -U mynah -d mynah -c "
-- Minimal seed with FK-satisfying parents
WITH p AS (INSERT INTO products (name, slug, description) VALUES ('Smoke', 'smoke14', 'x') RETURNING id),
     l AS (
       INSERT INTO legends (
         product_id, first_name, last_name, gender, age, location,
         life_details, professional, big_five, tech_savviness, typing_style,
         active_hours, active_days, average_post_length, hobbies,
         expertise_areas, product_relationship
       )
       SELECT id, 'A','B','female',30,
         '{\"city\":\"X\",\"state\":\"Y\",\"country\":\"Z\",\"timezone\":\"UTC\"}'::jsonb,
         '{\"maritalStatus\":\"single\"}'::jsonb,
         '{\"occupation\":\"o\",\"company\":\"c\",\"industry\":\"i\",\"yearsExperience\":1,\"education\":\"e\"}'::jsonb,
         '{\"openness\":5,\"conscientiousness\":5,\"extraversion\":5,\"agreeableness\":5,\"neuroticism\":5}'::jsonb,
         5,
         '{\"capitalization\":\"proper\",\"punctuation\":\"correct\",\"commonTypos\":[],\"commonPhrases\":[],\"avoidedPhrases\":[],\"paragraphStyle\":\"varied\",\"listStyle\":\"sometimes\",\"usesEmojis\":false,\"formality\":5}'::jsonb,
         '{\"start\":8,\"end\":22}'::jsonb,
         ARRAY[1,2,3,4,5],
         'short',
         ARRAY['h'],
         ARRAY['e'],
         '{\"discoveryStory\":\"ds\",\"usageDuration\":\"1mo\",\"satisfactionLevel\":5,\"complaints\":[],\"useCase\":\"uc\",\"alternativesConsidered\":[]}'::jsonb
       FROM p RETURNING id, product_id
     ),
     a AS (INSERT INTO legend_accounts (legend_id, platform, username, status) SELECT id,'reddit','smoke_u','active' FROM l RETURNING id),
     c AS (INSERT INTO communities (platform, identifier, name, status) VALUES ('reddit','smoke_c','Smoke Comm','active') RETURNING id)
INSERT INTO content_plans (legend_id, legend_account_id, community_id, platform, content_type, promotion_level, intent, body_draft, status, cost_millicents)
SELECT l.id, a.id, c.id, 'reddit','value_post',1,'Smoke intent','Smoke body draft — demonstrates queue rendering.','review',0
FROM l, a, c;"
```

- [ ] **Step 4.3: Browser check (Chrome)**

Open `http://localhost:36400/queue` in Chrome. Log in as `owner / Mynah-Dev-2026!`. Expect:
- Queue page shows one card with "Smoke intent" title, `value_post` / L1 / `reddit` badges, body text, "Approve" + "Reject" buttons.
- Click Reject — row disappears (invalidated + re-fetched as empty list). DB row's `status = rejected`.

- [ ] **Step 4.4: Tag + push**

```bash
docker compose down
git tag -a plan14-complete -m "Plan 14 (content approval queue) complete — API routes + shadcn UI + decision flow"
git push origin master
git push origin plan14-complete
```

- [ ] **Step 4.5: Mark README**

```markdown
| 14 | Dashboard: Content + Kanban — approval queue + task board | ✅ Complete (tag `plan14-complete`, kanban deferred to Plan 11.5+) | [2026-04-17-14-dashboard-content-queue.md](2026-04-17-14-dashboard-content-queue.md) |
```

Commit + push.

---

## Acceptance Criteria

1. ✅ `/content-plans`, `/content-plans/:id`, `/content-plans/:id/approve`, `/content-plans/:id/reject` exist and require `authenticate`
2. ✅ `ContentPlanService` approve/reject enforce `status=review` precondition (5/5 tests pass)
3. ✅ Dashboard `/queue` page renders review-status plans with approve/reject buttons
4. ✅ Mutation invalidates the list query so decided items disappear
5. ✅ Tag `plan14-complete` pushed

## Out of Scope

- **Task kanban** — deferred until Plan 11.5 (task persistence in Drizzle)
- **Bulk decisions** (select multiple + approve all)
- **Revise flow** (inline edit + re-generate) — can be a future plan
- **Rich display of QualityGate scores / SafetyWorker reasons** — queue UX shows cost + metadata only for now

---

**End of Plan 14.**
