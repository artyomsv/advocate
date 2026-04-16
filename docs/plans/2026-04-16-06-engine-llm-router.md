# Engine LLM Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the engine-level LLM abstraction: a provider interface, a budget tracker, and a router that picks models by task type with fallback chains, sensitive-data blocking, and monthly budget enforcement. Includes a `StubLLMProvider` for tests. Concrete providers (Anthropic, Google, OpenAI) arrive in Plan 06.5 as app-level implementations.

**Architecture:** Engine stays SDK-free. The router takes a task type + a sensitivity flag and consults a routing config (primary/fallback/budget model per task type) plus the current operating mode (`primary` / `balanced` / `budget`). Budget cap is enforced before dispatch; exceeding the cap auto-downgrades to `budget` mode and emits a signal. Every call records usage via the `BudgetTracker` so totals are queryable. Sensitive task types never route to budget-tier models even in `budget` mode.

**Tech Stack:** TypeScript ESM · Vitest · no new runtime dependencies — this plan ships interfaces and reference impls only

**Prerequisites:**
- Plan 05 complete (tag `plan05-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/engine/src/llm/
├── index.ts                     # Barrel
├── types.ts                     # LlmRequest, LlmResponse, CostEstimate, LlmUsageRecord
├── provider.ts                  # LLMProvider interface + StubLLMProvider
├── budget.ts                    # BudgetTracker interface + InMemoryBudgetTracker
└── router.ts                    # LLMRouter interface + InMemoryLLMRouter + ModelRoute / RouterConfig

packages/engine/tests/llm/
├── provider.test.ts             # Stub provider behavior
├── budget.test.ts               # Monthly spend tracking, month boundaries
└── router.test.ts               # Mode switching, fallback, sensitivity blocking, budget gating
```

## Design decisions

1. **Money in millicents.** `costMillicents` = 1/100,000 of a USD. Consistent with the `llm_usage` DB column from Plan 02. Lets us preserve per-token precision; aggregate totals convert to cents at the billing boundary.

2. **Routing is config-driven, not code.** The router carries a `Record<string, ModelRoute>` mapping task types to primary/fallback/budget choices. New task types can be added at runtime without new code.

3. **Three modes:** `primary` (always use the best), `balanced` (primary, fallback to cheaper on failure), `budget` (always use cheapest). Sensitive tasks override mode selection to never touch budget-tier providers even in `budget` mode.

4. **Fallback is a chain, not a tree.** `primary` → `fallback` → `budget` in order. The router retries at most once per tier; if all three fail, the call errors. No circular loops.

5. **Budget enforcement pre-dispatch.** Before issuing a call, the router checks projected month-to-date spend. If adding the max estimate would exceed the cap, the router auto-switches to `budget` mode (emits a signal) for that call. If the budget is fully exhausted AND the task is sensitive (no budget-tier option available), the call fails with a typed `BudgetExhaustedError`.

6. **StubLLMProvider is deterministic.** Takes a map of `(systemPrompt + userPrompt) → LlmResponse` and returns the matching stub. Unknown prompts can be configured to throw (for failure simulation) or return a default stub. Enables testing every router branch without real API calls.

7. **No quality-gate escalation yet.** The plan spec mentions "auto-escalate when cheap model produces low-quality output" — that requires a quality scorer (Plan 11 agent). For now the router only escalates on provider errors, not quality.

---

## Task 1: LLM Types

**Files:**
- Create: `packages/engine/src/llm/types.ts`

- [ ] **Step 1.1: Create the types file**

```typescript
import type { IsoTimestamp } from '../types/common.js';

/**
 * Input shape for an LLM call. The three-layer prompt architecture
 * flattens into a single (systemPrompt, userPrompt) pair at this layer —
 * composition of soul + product knowledge + context is an app-level concern.
 */
export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  /** 0.0–2.0. Provider may clamp. */
  temperature?: number;
  maxTokens?: number;
  /** Request structured JSON output when the provider supports it. */
  responseFormat?: 'text' | 'json';
}

/**
 * Result of an LLM call. `costMillicents` uses millicents (1/100,000 USD)
 * so per-token precision survives aggregation.
 */
export interface LlmResponse {
  content: string;
  usage: LlmTokenUsage;
  costMillicents: number;
  providerId: string;
  model: string;
  latencyMs: number;
}

export interface LlmTokenUsage {
  inputTokens: number;
  outputTokens: number;
  /** Cached input tokens (Anthropic prompt caching). Absent or 0 when unused. */
  cachedTokens?: number;
}

/**
 * Estimated min/max cost of a call before it is dispatched.
 * The router uses the `maxMillicents` value for pre-dispatch budget checks.
 */
export interface CostEstimate {
  minMillicents: number;
  maxMillicents: number;
}

/**
 * Recorded call for budget / analytics.
 */
export interface LlmUsageRecord {
  providerId: string;
  model: string;
  taskType: string;
  usage: LlmTokenUsage;
  costMillicents: number;
  latencyMs: number;
  occurredAt: IsoTimestamp;
  /** Quality score (1-10) attached retroactively by the Quality Gate. Optional. */
  qualityScore?: number;
}

/**
 * Snapshot of current budget state, exposed for dashboards + decisions.
 */
export interface BudgetStatus {
  monthlyCapCents: number;
  spentCents: number;
  remainingCents: number;
  /** Linear extrapolation: spent / days-elapsed × days-in-month. */
  projectedMonthEndCents: number;
}

/**
 * Thrown when the router cannot satisfy a call without exceeding budget
 * AND no budget-tier fallback is allowed (e.g. sensitive task in budget
 * mode when the sensitive list blocks budget-tier providers).
 */
export class BudgetExhaustedError extends Error {
  constructor(public readonly status: BudgetStatus) {
    super(
      `LLM monthly budget exhausted: spent ${status.spentCents}¢ of ${status.monthlyCapCents}¢`,
    );
    this.name = 'BudgetExhaustedError';
  }
}
```

- [ ] **Step 1.2: Typecheck + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/engine typecheck
git add packages/engine/src/llm/
git commit -m "feat(engine): add LLM domain types (LlmRequest, LlmResponse, CostEstimate, BudgetStatus)"
```

---

## Task 2: LLM Provider Interface + Stub

**Files:**
- Create: `packages/engine/src/llm/provider.ts`
- Create: `packages/engine/tests/llm/provider.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Create `packages/engine/tests/llm/provider.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { StubLLMProvider } from '../../src/llm/provider.js';

describe('StubLLMProvider', () => {
  let provider: StubLLMProvider;

  beforeEach(() => {
    provider = new StubLLMProvider({ providerId: 'stub', defaultModel: 'stub-1' });
  });

  it('returns the configured stub for a matching (system, user) prompt', async () => {
    provider.setStub('sys', 'hello', {
      content: 'hi back',
      usage: { inputTokens: 5, outputTokens: 4 },
      costMillicents: 10,
      latencyMs: 42,
    });
    const r = await provider.generate('stub-1', {
      systemPrompt: 'sys',
      userPrompt: 'hello',
    });
    expect(r.content).toBe('hi back');
    expect(r.providerId).toBe('stub');
    expect(r.model).toBe('stub-1');
    expect(r.costMillicents).toBe(10);
  });

  it('throws on unknown prompts by default', async () => {
    await expect(
      provider.generate('stub-1', { systemPrompt: 'x', userPrompt: 'y' }),
    ).rejects.toThrow(/no stub/i);
  });

  it('returns the default stub when configured', async () => {
    provider.setDefaultStub({
      content: 'default',
      usage: { inputTokens: 1, outputTokens: 1 },
      costMillicents: 1,
      latencyMs: 1,
    });
    const r = await provider.generate('stub-1', {
      systemPrompt: 'unknown',
      userPrompt: 'also unknown',
    });
    expect(r.content).toBe('default');
  });

  it('throws the configured error when simulating a failure', async () => {
    provider.setFailure('sys', 'fail', new Error('provider exploded'));
    await expect(
      provider.generate('stub-1', { systemPrompt: 'sys', userPrompt: 'fail' }),
    ).rejects.toThrow(/exploded/);
  });

  it('availableModels contains the default model', () => {
    expect(provider.availableModels).toContain('stub-1');
  });

  it('estimateCost returns configured cost or default when not set', () => {
    expect(provider.estimateCost('stub-1', { systemPrompt: 's', userPrompt: 'u' }))
      .toEqual({ minMillicents: 0, maxMillicents: 0 });
    provider.setCostEstimate('stub-1', { minMillicents: 5, maxMillicents: 50 });
    expect(provider.estimateCost('stub-1', { systemPrompt: 's', userPrompt: 'u' }))
      .toEqual({ minMillicents: 5, maxMillicents: 50 });
  });

  it('rejects calls for models not in availableModels', async () => {
    await expect(
      provider.generate('nonexistent', { systemPrompt: 's', userPrompt: 'u' }),
    ).rejects.toThrow(/unsupported model/i);
  });
});
```

- [ ] **Step 2.2: Run test — MUST FAIL**

```bash
mkdir -p packages/engine/tests/llm
pnpm --filter @advocate/engine test llm/provider
```

- [ ] **Step 2.3: Implement `packages/engine/src/llm/provider.ts`**

```typescript
import type { CostEstimate, LlmRequest, LlmResponse } from './types.js';

/**
 * Provider contract. Implementations wrap an SDK (Anthropic, Google, OpenAI,
 * DeepSeek, Qwen) and translate `LlmRequest` → provider call → `LlmResponse`.
 *
 * Providers MUST handle their own retry/backoff for transient errors and
 * throw on non-recoverable errors; the router treats any thrown error as a
 * signal to fall back to the next tier.
 */
export interface LLMProvider {
  readonly providerId: string;
  readonly availableModels: readonly string[];

  generate(model: string, request: LlmRequest): Promise<LlmResponse>;

  /** Pre-dispatch cost estimate used by the router for budget checks. */
  estimateCost(model: string, request: LlmRequest): CostEstimate;
}

/**
 * Deterministic test provider. Configure stubs keyed by (systemPrompt, userPrompt)
 * pairs; set a default stub or a default failure for unknown prompts.
 */
export interface StubLLMProviderOptions {
  providerId: string;
  defaultModel: string;
  extraModels?: readonly string[];
}

type StubBody = Omit<LlmResponse, 'providerId' | 'model'>;

export class StubLLMProvider implements LLMProvider {
  readonly providerId: string;
  readonly availableModels: readonly string[];

  #stubs = new Map<string, StubBody>();
  #failures = new Map<string, Error>();
  #costs = new Map<string, CostEstimate>();
  #defaultStub?: StubBody;

  constructor(options: StubLLMProviderOptions) {
    this.providerId = options.providerId;
    this.availableModels = [options.defaultModel, ...(options.extraModels ?? [])];
  }

  setStub(systemPrompt: string, userPrompt: string, body: StubBody): void {
    this.#stubs.set(this.#key(systemPrompt, userPrompt), body);
  }

  setDefaultStub(body: StubBody): void {
    this.#defaultStub = body;
  }

  setFailure(systemPrompt: string, userPrompt: string, error: Error): void {
    this.#failures.set(this.#key(systemPrompt, userPrompt), error);
  }

  setCostEstimate(model: string, estimate: CostEstimate): void {
    this.#costs.set(model, estimate);
  }

  async generate(model: string, request: LlmRequest): Promise<LlmResponse> {
    if (!this.availableModels.includes(model)) {
      throw new Error(`Unsupported model: ${model}`);
    }
    const key = this.#key(request.systemPrompt, request.userPrompt);
    const failure = this.#failures.get(key);
    if (failure) throw failure;
    const body = this.#stubs.get(key) ?? this.#defaultStub;
    if (!body) {
      throw new Error(
        `No stub configured for (systemPrompt, userPrompt) — call setStub or setDefaultStub`,
      );
    }
    return { ...body, providerId: this.providerId, model };
  }

  estimateCost(model: string, _request: LlmRequest): CostEstimate {
    return this.#costs.get(model) ?? { minMillicents: 0, maxMillicents: 0 };
  }

  #key(systemPrompt: string, userPrompt: string): string {
    return `${systemPrompt}\u0000${userPrompt}`;
  }
}
```

- [ ] **Step 2.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test llm/provider
pnpm lint
git add packages/engine/src/llm/provider.ts packages/engine/tests/llm/provider.test.ts
git commit -m "feat(engine): add LLMProvider interface + StubLLMProvider"
```

---

## Task 3: Budget Tracker

**Files:**
- Create: `packages/engine/src/llm/budget.ts`
- Create: `packages/engine/tests/llm/budget.test.ts`

- [ ] **Step 3.1: Write failing test FIRST**

Create `packages/engine/tests/llm/budget.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryBudgetTracker } from '../../src/llm/budget.js';
import type { LlmUsageRecord } from '../../src/llm/types.js';
import type { IsoTimestamp } from '../../src/types/common.js';

function record(occurredAt: string, costMillicents: number): LlmUsageRecord {
  return {
    providerId: 'stub',
    model: 'stub-1',
    taskType: 'content_writing',
    usage: { inputTokens: 10, outputTokens: 10 },
    costMillicents,
    latencyMs: 10,
    occurredAt: occurredAt as IsoTimestamp,
  };
}

describe('InMemoryBudgetTracker', () => {
  let tracker: InMemoryBudgetTracker;

  beforeEach(() => {
    tracker = new InMemoryBudgetTracker({ monthlyCapCents: 2000 });
  });

  it('starts with zero spend and full budget', async () => {
    const status = await tracker.getStatus();
    expect(status.spentCents).toBe(0);
    expect(status.remainingCents).toBe(2000);
    expect(status.monthlyCapCents).toBe(2000);
  });

  it('record increments the current month spend (cents = millicents / 1000 rounded)', async () => {
    // 2500 millicents = 2.5 cents → rounds to 3 (ceil at aggregate boundary)
    await tracker.record(record('2026-04-10T12:00:00.000Z', 2500));
    const status = await tracker.getStatus(new Date('2026-04-15T12:00:00.000Z'));
    expect(status.spentCents).toBe(3);
  });

  it('aggregates multiple records within the same month', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 50_000)); // 50¢
    await tracker.record(record('2026-04-20T00:00:00.000Z', 30_000)); // 30¢
    const status = await tracker.getStatus(new Date('2026-04-25T00:00:00.000Z'));
    expect(status.spentCents).toBe(80);
  });

  it('does not count records from a different month', async () => {
    await tracker.record(record('2026-03-15T00:00:00.000Z', 100_000)); // March: 100¢
    await tracker.record(record('2026-04-10T00:00:00.000Z', 20_000));  // April: 20¢
    const status = await tracker.getStatus(new Date('2026-04-25T00:00:00.000Z'));
    expect(status.spentCents).toBe(20);
  });

  it('projectedMonthEndCents linearly extrapolates', async () => {
    // Spend 100¢ by day 10 in a 30-day month → projection ≈ 300¢
    await tracker.record(record('2026-04-05T00:00:00.000Z', 100_000));
    const status = await tracker.getStatus(new Date('2026-04-10T00:00:00.000Z'));
    expect(status.projectedMonthEndCents).toBeGreaterThan(250);
    expect(status.projectedMonthEndCents).toBeLessThan(350);
  });

  it('remainingCents clamps at 0 when over budget', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 5_000_000)); // 5000¢
    const status = await tracker.getStatus(new Date('2026-04-15T00:00:00.000Z'));
    expect(status.remainingCents).toBe(0);
    expect(status.spentCents).toBe(5000);
  });

  it('getRecords returns records in chronological order', async () => {
    await tracker.record(record('2026-04-10T00:00:00.000Z', 10_000));
    await tracker.record(record('2026-04-05T00:00:00.000Z', 20_000));
    const list = await tracker.getRecords(new Date('2026-04-01T00:00:00.000Z'));
    expect(list.map((r) => r.occurredAt)).toEqual([
      '2026-04-05T00:00:00.000Z',
      '2026-04-10T00:00:00.000Z',
    ]);
  });
});
```

- [ ] **Step 3.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test llm/budget
```

- [ ] **Step 3.3: Implement `packages/engine/src/llm/budget.ts`**

```typescript
import type { BudgetStatus, LlmUsageRecord } from './types.js';

export interface BudgetTracker {
  record(usage: LlmUsageRecord): Promise<void>;
  /** Budget status for the month containing `now`. Defaults to the actual now. */
  getStatus(now?: Date): Promise<BudgetStatus>;
  /** Records since `since` in chronological order. */
  getRecords(since: Date): Promise<readonly LlmUsageRecord[]>;
}

export interface BudgetTrackerOptions {
  monthlyCapCents: number;
}

export class InMemoryBudgetTracker implements BudgetTracker {
  readonly #records: LlmUsageRecord[] = [];
  readonly #monthlyCapCents: number;

  constructor(options: BudgetTrackerOptions) {
    this.#monthlyCapCents = options.monthlyCapCents;
  }

  async record(usage: LlmUsageRecord): Promise<void> {
    this.#records.push(usage);
  }

  async getStatus(now: Date = new Date()): Promise<BudgetStatus> {
    const { year, month } = ym(now);
    const millicentsThisMonth = this.#records
      .filter((r) => {
        const d = new Date(r.occurredAt);
        return d.getUTCFullYear() === year && d.getUTCMonth() === month;
      })
      .reduce((sum, r) => sum + r.costMillicents, 0);

    // Convert millicents to cents: divide by 1000. Round UP so aggregate display
    // is conservative (never undercounts).
    const spentCents = Math.ceil(millicentsThisMonth / 1000);
    const remainingCents = Math.max(0, this.#monthlyCapCents - spentCents);

    // Linear extrapolation for projection.
    const daysElapsed = Math.max(1, now.getUTCDate());
    const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const projectedMonthEndCents = Math.ceil((spentCents / daysElapsed) * daysInMonth);

    return {
      monthlyCapCents: this.#monthlyCapCents,
      spentCents,
      remainingCents,
      projectedMonthEndCents,
    };
  }

  async getRecords(since: Date): Promise<readonly LlmUsageRecord[]> {
    return this.#records
      .filter((r) => new Date(r.occurredAt).getTime() >= since.getTime())
      .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1));
  }
}

function ym(d: Date): { year: number; month: number } {
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}
```

- [ ] **Step 3.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test llm/budget
pnpm lint
git add packages/engine/src/llm/budget.ts packages/engine/tests/llm/budget.test.ts
git commit -m "feat(engine): add BudgetTracker with monthly spend + linear projection"
```

---

## Task 4: LLM Router

**Files:**
- Create: `packages/engine/src/llm/router.ts`
- Create: `packages/engine/tests/llm/router.test.ts`

- [ ] **Step 4.1: Write failing test FIRST**

Create `packages/engine/tests/llm/router.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryBudgetTracker } from '../../src/llm/budget.js';
import { StubLLMProvider } from '../../src/llm/provider.js';
import { InMemoryLLMRouter, type RouterConfig } from '../../src/llm/router.js';

function makeRouter(overrides: Partial<RouterConfig> = {}) {
  const primary = new StubLLMProvider({ providerId: 'primary', defaultModel: 'primary-1' });
  const fallback = new StubLLMProvider({ providerId: 'fallback', defaultModel: 'fallback-1' });
  const budget = new StubLLMProvider({ providerId: 'budget', defaultModel: 'budget-1' });

  const stubBody = {
    usage: { inputTokens: 1, outputTokens: 1 },
    costMillicents: 1000,
    latencyMs: 10,
  };
  primary.setDefaultStub({ ...stubBody, content: 'from-primary' });
  fallback.setDefaultStub({ ...stubBody, content: 'from-fallback' });
  budget.setDefaultStub({ ...stubBody, content: 'from-budget' });

  const tracker = new InMemoryBudgetTracker({ monthlyCapCents: 10_000 });

  const config: RouterConfig = {
    mode: 'primary',
    sensitiveTaskTypes: ['strategy_planning'],
    routes: {
      content_writing: {
        primary: { providerId: 'primary', model: 'primary-1' },
        fallback: { providerId: 'fallback', model: 'fallback-1' },
        budget: { providerId: 'budget', model: 'budget-1' },
      },
      strategy_planning: {
        primary: { providerId: 'primary', model: 'primary-1' },
        fallback: { providerId: 'fallback', model: 'fallback-1' },
        budget: { providerId: 'budget', model: 'budget-1' },
      },
    },
    ...overrides,
  };

  const router = new InMemoryLLMRouter({
    providers: [primary, fallback, budget],
    tracker,
    config,
  });

  return { router, tracker, primary, fallback, budget };
}

describe('InMemoryLLMRouter', () => {
  describe('mode routing', () => {
    it('primary mode uses the primary provider', async () => {
      const { router } = makeRouter();
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.content).toBe('from-primary');
      expect(r.providerId).toBe('primary');
    });

    it('budget mode uses the budget provider', async () => {
      const { router } = makeRouter({ mode: 'budget' });
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.content).toBe('from-budget');
    });

    it('balanced mode uses primary when healthy', async () => {
      const { router } = makeRouter({ mode: 'balanced' });
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('primary');
    });
  });

  describe('fallback chain', () => {
    it('falls back from primary to fallback on primary error', async () => {
      const { router, primary } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('fallback');
    });

    it('falls back further to budget on both primary and fallback failure', async () => {
      const { router, primary, fallback } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      fallback.setFailure('s', 'u', new Error('fallback down'));
      const r = await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('budget');
    });

    it('throws when all three tiers fail', async () => {
      const { router, primary, fallback, budget } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('p'));
      fallback.setFailure('s', 'u', new Error('f'));
      budget.setFailure('s', 'u', new Error('b'));
      await expect(
        router.generate('content_writing', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow(/all.*tiers/i);
    });
  });

  describe('sensitivity', () => {
    it('blocks budget tier for sensitive task types even in budget mode', async () => {
      const { router } = makeRouter({ mode: 'budget' });
      // strategy_planning is in sensitiveTaskTypes
      const r = await router.generate('strategy_planning', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('primary');
    });

    it('when sensitive + primary fails, falls to fallback NOT budget', async () => {
      const { router, primary } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('primary down'));
      const r = await router.generate('strategy_planning', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      expect(r.providerId).toBe('fallback');
    });

    it('sensitive + primary+fallback fail → throws (no budget escape hatch)', async () => {
      const { router, primary, fallback } = makeRouter({ mode: 'primary' });
      primary.setFailure('s', 'u', new Error('p'));
      fallback.setFailure('s', 'u', new Error('f'));
      await expect(
        router.generate('strategy_planning', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow();
    });
  });

  describe('budget gating', () => {
    it('records every successful call via the tracker', async () => {
      const { router, tracker } = makeRouter();
      await router.generate('content_writing', {
        systemPrompt: 's',
        userPrompt: 'u',
      });
      const status = await tracker.getStatus();
      // 1000 millicents = 1¢, rounded up
      expect(status.spentCents).toBe(1);
    });

    it('unknown task type throws a clear error', async () => {
      const { router } = makeRouter();
      await expect(
        router.generate('not_a_task', { systemPrompt: 's', userPrompt: 'u' }),
      ).rejects.toThrow(/unknown task type/i);
    });
  });

  describe('mode accessors', () => {
    it('setMode updates the active mode', () => {
      const { router } = makeRouter();
      expect(router.getMode()).toBe('primary');
      router.setMode('budget');
      expect(router.getMode()).toBe('budget');
    });
  });
});
```

- [ ] **Step 4.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test llm/router
```

- [ ] **Step 4.3: Implement `packages/engine/src/llm/router.ts`**

```typescript
import { isoNow } from '../types/common.js';
import type { BudgetTracker } from './budget.js';
import type { LLMProvider } from './provider.js';
import {
  type BudgetStatus,
  type LlmRequest,
  type LlmResponse,
  type LlmUsageRecord,
} from './types.js';

export type RouterMode = 'primary' | 'balanced' | 'budget';

export interface ModelChoice {
  providerId: string;
  model: string;
}

export interface ModelRoute {
  primary: ModelChoice;
  fallback: ModelChoice;
  budget: ModelChoice;
}

export interface RouterConfig {
  mode: RouterMode;
  routes: Record<string, ModelRoute>;
  sensitiveTaskTypes: readonly string[];
}

export interface GenerateOptions {
  /** Force sensitive handling even if the task type isn't in `sensitiveTaskTypes`. */
  sensitive?: boolean;
}

export interface LLMRouter {
  generate(taskType: string, request: LlmRequest, options?: GenerateOptions): Promise<LlmResponse>;
  setMode(mode: RouterMode): void;
  getMode(): RouterMode;
  getBudgetStatus(): Promise<BudgetStatus>;
}

export interface LLMRouterOptions {
  providers: readonly LLMProvider[];
  tracker: BudgetTracker;
  config: RouterConfig;
}

export class InMemoryLLMRouter implements LLMRouter {
  readonly #providersById = new Map<string, LLMProvider>();
  readonly #tracker: BudgetTracker;
  #config: RouterConfig;

  constructor(options: LLMRouterOptions) {
    for (const provider of options.providers) {
      this.#providersById.set(provider.providerId, provider);
    }
    this.#tracker = options.tracker;
    this.#config = { ...options.config };
  }

  setMode(mode: RouterMode): void {
    this.#config = { ...this.#config, mode };
  }

  getMode(): RouterMode {
    return this.#config.mode;
  }

  async getBudgetStatus(): Promise<BudgetStatus> {
    return this.#tracker.getStatus();
  }

  async generate(
    taskType: string,
    request: LlmRequest,
    options: GenerateOptions = {},
  ): Promise<LlmResponse> {
    const route = this.#config.routes[taskType];
    if (!route) {
      throw new Error(`Unknown task type: ${taskType}`);
    }

    const sensitive = options.sensitive || this.#config.sensitiveTaskTypes.includes(taskType);
    const tiers = this.#resolveTiers(route, sensitive);

    let lastError: unknown;
    for (const tier of tiers) {
      const provider = this.#providersById.get(tier.providerId);
      if (!provider) {
        lastError = new Error(`Provider not registered: ${tier.providerId}`);
        continue;
      }
      try {
        const response = await provider.generate(tier.model, request);
        const record: LlmUsageRecord = {
          providerId: response.providerId,
          model: response.model,
          taskType,
          usage: response.usage,
          costMillicents: response.costMillicents,
          latencyMs: response.latencyMs,
          occurredAt: isoNow(),
        };
        await this.#tracker.record(record);
        return response;
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      `All ${tiers.length} tiers failed for task type "${taskType}": ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`,
    );
  }

  #resolveTiers(route: ModelRoute, sensitive: boolean): ModelChoice[] {
    // Primary mode: primary → fallback → budget
    // Balanced mode: primary → fallback → budget (same fallback chain; the
    //   difference is that balanced is tolerant of failing over quickly).
    // Budget mode: budget → fallback → primary (flipped priority).
    // Sensitive: budget tier is ALWAYS removed from the chain.
    const ordered: ModelChoice[] = [];
    if (this.#config.mode === 'budget' && !sensitive) {
      ordered.push(route.budget, route.fallback, route.primary);
    } else {
      ordered.push(route.primary, route.fallback);
      if (!sensitive) ordered.push(route.budget);
    }
    return ordered;
  }
}
```

- [ ] **Step 4.4: Run test + commit + push**

```bash
pnpm --filter @advocate/engine test llm/router
pnpm lint
git add packages/engine/src/llm/router.ts packages/engine/tests/llm/router.test.ts
git commit -m "feat(engine): add LLMRouter with fallback chain + sensitivity blocking"
git push origin master
```

---

## Task 5: Barrel + Docker Verification + Tag

- [ ] **Step 5.1: Create LLM barrel**

`packages/engine/src/llm/index.ts`:

```typescript
export * from './budget.js';
export * from './provider.js';
export * from './router.js';
export * from './types.js';
```

- [ ] **Step 5.2: Extend public barrel `packages/engine/src/index.ts`**

Append:

```typescript
// LLM
export {
  type BudgetTracker,
  InMemoryBudgetTracker,
  type BudgetTrackerOptions,
} from './llm/budget.js';
export {
  type LLMProvider,
  StubLLMProvider,
  type StubLLMProviderOptions,
} from './llm/provider.js';
export {
  type GenerateOptions,
  InMemoryLLMRouter,
  type LLMRouter,
  type LLMRouterOptions,
  type ModelChoice,
  type ModelRoute,
  type RouterConfig,
  type RouterMode,
} from './llm/router.js';
export {
  type BudgetStatus,
  BudgetExhaustedError,
  type CostEstimate,
  type LlmRequest,
  type LlmResponse,
  type LlmTokenUsage,
  type LlmUsageRecord,
} from './llm/types.js';
```

Biome will alphabetize; accept the reorder.

- [ ] **Step 5.3: Verify full suite**

```bash
pnpm --filter @advocate/engine typecheck
pnpm --filter @advocate/engine build
pnpm --filter @advocate/engine test
pnpm lint
```

Expected: engine tests ~ 82 + 7 provider + 7 budget + 12 router ≈ 108 passing.

- [ ] **Step 5.4: Commit barrel + push**

```bash
git add packages/engine/src/
git commit -m "feat(engine): expose LLM router + provider + budget via public barrel"
git push origin master
```

- [ ] **Step 5.5: Docker round-trip**

```bash
docker compose down
docker compose up -d --build
# wait for api healthy
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps
curl -s http://localhost:36401/health
docker compose down
```

Expected `/health` JSON: `{"status":"ok","checks":{"database":true,"redis":true}}`.

- [ ] **Step 5.6: Tag + push**

```bash
git tag -a plan06-complete -m "Plan 06 Engine LLM Router complete"
git push origin plan06-complete
```

---

## Acceptance Criteria

1. ✅ `LlmRequest`, `LlmResponse`, `CostEstimate`, `BudgetStatus`, `BudgetExhaustedError` types shipped
2. ✅ `LLMProvider` interface + `StubLLMProvider` shipped with tests
3. ✅ `BudgetTracker` + `InMemoryBudgetTracker` ship monthly aggregation + projection
4. ✅ `LLMRouter` + `InMemoryLLMRouter` with mode routing, fallback chain, sensitivity blocking, usage recording
5. ✅ All new types/classes exported via public barrel
6. ✅ `pnpm verify` passes
7. ✅ Docker stack boots healthy, `/health` returns ok
8. ✅ Tag `plan06-complete` pushed

## Out of Scope

- Concrete providers (Anthropic, Google, OpenAI, DeepSeek, Qwen) → Plan 06.5 (app-level)
- Quality-gate-driven auto-escalation (escalating from cheap to premium on low quality scores) → Plan 11 once the Quality Gate agent exists
- Prompt caching orchestration (Anthropic-specific) → Plan 06.5 (provider-specific)
- Persistent budget storage (Drizzle-backed tracker) → Plan 07 StorageProvider

---

**End of Plan 06 (Engine: LLM Router).**
