# Engine Memory + Tasks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the episodic + relational memory system and the kanban task board as engine-level abstractions. Ships interface contracts and testable in-memory reference implementations. Drizzle-backed implementations come in Plan 07 once the StorageProvider abstraction exists.

**Architecture:** Every concern is an interface first; the reference in-memory implementation lives alongside so tests and future app code have something to compose against without requiring Postgres. Status transitions on the kanban board are enforced by the board (not by callers) — illegal transitions throw. Memory consolidation is separated into a `MemoryConsolidator` interface whose default naive implementation concatenates episodes into a summary (good enough for tests); the LLM-powered consolidator replaces this in Plan 06.

**Tech Stack:** TypeScript ESM · Vitest · uses `node:crypto` `randomUUID` for ID generation · no new dependencies

**Prerequisites:**
- Plan 03 complete (tag `plan03-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`

---

## File Structure Overview

```
packages/engine/src/
├── memory/
│   ├── index.ts                     # Memory barrel
│   ├── types.ts                     # Sentiment, Episode, ConsolidatedMemory, Relationship
│   ├── episodic-store.ts            # EpisodicMemoryStore + InMemoryEpisodicStore
│   ├── relational-store.ts          # RelationalMemoryStore + InMemoryRelationalStore
│   └── consolidator.ts              # MemoryConsolidator + NaiveMemoryConsolidator
├── tasks/
│   ├── index.ts                     # Tasks barrel
│   ├── types.ts                     # TaskStatus, TaskPriority, Task, TaskComment, TaskArtifact
│   ├── transitions.ts               # Status transition validator
│   └── board.ts                     # KanbanBoard + InMemoryKanbanBoard

packages/engine/tests/
├── memory/
│   ├── episodic-store.test.ts
│   ├── relational-store.test.ts
│   └── consolidator.test.ts
└── tasks/
    ├── board.test.ts
    └── transitions.test.ts
```

## Design decisions

1. **Interfaces live alongside reference implementations.** `episodic-store.ts` exports both `EpisodicMemoryStore` (interface) and `InMemoryEpisodicStore` (in-memory reference). The Plan 07 Drizzle implementation will be a second class that implements the same interface.

2. **IDs are `randomUUID` v4 strings.** Branded as `MemoryId` / `TaskId` via the existing `as*` helpers.

3. **Status transitions are enforced.** `transitions.ts` exports a `canTransition(from, to)` predicate and a `TRANSITIONS` table. The board rejects illegal transitions with a clear error referencing the current and target status.

4. **Naive consolidation doesn't need an LLM.** It concatenates action/outcome pairs into a plain-text summary and extracts any episode-level `lesson` strings into the lessons list. Real LLM-driven summarization replaces this implementation in Plan 06.

5. **In-memory stores are NOT thread-safe.** They're single-process reference impls. Concurrency is orthogonal to this plan; when Postgres-backed stores arrive (Plan 07) transactional guarantees are delegated to the DB.

6. **No messaging yet.** `taskId` references, `createdBy` agent IDs, etc. are just strings here — no foreign-key enforcement. The DB-backed implementations in Plan 07 will add referential integrity.

---

## Task 1: Memory Types

**Files:**
- Create: `packages/engine/src/memory/types.ts`

- [ ] **Step 1.1: Create the types file**

```typescript
import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';

export type Sentiment = 'positive' | 'neutral' | 'negative';

/**
 * A single raw event in an agent's history. Emitted by the runtime on every
 * task completion, platform interaction, or significant decision.
 *
 * Older episodes are consolidated into `ConsolidatedMemory` rows by the
 * `MemoryConsolidator` on the schedule defined by the agent's `MemoryConfig`.
 */
export interface Episode {
  id: MemoryId;
  agentId: AgentId;
  action: string;
  outcome: string;
  /** Optional AI-extracted lesson (e.g. "r/X prefers specific dollar amounts"). */
  lesson?: string;
  sentiment: Sentiment;
  /** Free-form context: platform, community, thread URL, etc. */
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  createdAt: IsoTimestamp;
}

export interface NewEpisode {
  agentId: AgentId;
  action: string;
  outcome: string;
  lesson?: string;
  sentiment?: Sentiment;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Compressed summary of a window of older episodes. The consolidator produces
 * these and typically deletes the source episodes to cap storage growth.
 */
export interface ConsolidatedMemory {
  id: MemoryId;
  agentId: AgentId;
  sourceEpisodeIds: readonly MemoryId[];
  summary: string;
  lessons: readonly string[];
  periodFrom: IsoTimestamp;
  periodTo: IsoTimestamp;
  consolidatedAt: IsoTimestamp;
}

/**
 * Input to `saveConsolidation` — id + consolidatedAt are assigned by the store.
 */
export interface NewConsolidatedMemory {
  agentId: AgentId;
  sourceEpisodeIds: readonly MemoryId[];
  summary: string;
  lessons: readonly string[];
  periodFrom: IsoTimestamp;
  periodTo: IsoTimestamp;
}

/**
 * A tracked relationship between an agent and an external actor (a platform
 * user, moderator, or other community member).
 */
export interface Relationship {
  id: MemoryId;
  agentId: AgentId;
  externalUsername: string;
  platform: string;
  context: string;
  sentiment: Sentiment;
  interactionCount: number;
  lastInteractionAt: IsoTimestamp;
  notes?: string;
  tags: readonly string[];
}

export interface NewRelationship {
  agentId: AgentId;
  externalUsername: string;
  platform: string;
  context: string;
  sentiment?: Sentiment;
  notes?: string;
  tags?: readonly string[];
}
```

- [ ] **Step 1.2: Typecheck + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/engine typecheck
git add packages/engine/src/memory/types.ts
git commit -m "feat(engine): add memory domain types (Episode, ConsolidatedMemory, Relationship)"
```

---

## Task 2: Episodic Memory Store

**Files:**
- Create: `packages/engine/src/memory/episodic-store.ts`
- Create: `packages/engine/tests/memory/episodic-store.test.ts`

- [ ] **Step 2.1: Write failing test FIRST**

Create `packages/engine/tests/memory/episodic-store.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryEpisodicStore } from '../../src/memory/episodic-store.js';
import type { IsoTimestamp } from '../../src/types/common.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryEpisodicStore', () => {
  let store: InMemoryEpisodicStore;

  beforeEach(() => {
    store = new InMemoryEpisodicStore();
  });

  it('records an episode with assigned id, createdAt, default sentiment', async () => {
    const ep = await store.record({
      agentId: agentA,
      action: 'commented on r/Plumbing thread',
      outcome: '12 upvotes',
    });
    expect(ep.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(ep.sentiment).toBe('neutral');
    expect(ep.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(ep.agentId).toBe(agentA);
  });

  it('preserves explicit sentiment, lesson, context, metadata', async () => {
    const ep = await store.record({
      agentId: agentA,
      action: 'posted',
      outcome: 'removed by mod',
      sentiment: 'negative',
      lesson: 'avoid r/X — strict no-promo rule',
      context: { platform: 'reddit', community: 'r/X' },
      metadata: { modAction: 'remove' },
    });
    expect(ep.sentiment).toBe('negative');
    expect(ep.lesson).toContain('no-promo');
    expect(ep.context).toEqual({ platform: 'reddit', community: 'r/X' });
    expect(ep.metadata).toEqual({ modAction: 'remove' });
  });

  it('getRecent returns latest-first bounded by limit', async () => {
    for (let i = 0; i < 5; i++) {
      await store.record({ agentId: agentA, action: `a${i}`, outcome: `o${i}` });
    }
    const recent = await store.getRecent(agentA, 3);
    expect(recent).toHaveLength(3);
    // Latest-first: a4 before a3 before a2
    expect(recent[0]?.action).toBe('a4');
    expect(recent[2]?.action).toBe('a2');
  });

  it('getRecent defaults to 50 when limit omitted', async () => {
    for (let i = 0; i < 60; i++) {
      await store.record({ agentId: agentA, action: `a${i}`, outcome: `o${i}` });
    }
    const recent = await store.getRecent(agentA);
    expect(recent).toHaveLength(50);
  });

  it('scopes getRecent to agent', async () => {
    await store.record({ agentId: agentA, action: 'a-a', outcome: 'oa' });
    await store.record({ agentId: agentB, action: 'b-a', outcome: 'ob' });
    const a = await store.getRecent(agentA);
    expect(a).toHaveLength(1);
    expect(a[0]?.action).toBe('a-a');
  });

  it('getBetween filters inclusive on both ends', async () => {
    const ep1 = await store.record({ agentId: agentA, action: 'a1', outcome: 'o1' });
    // Record another; brief gap
    await new Promise((r) => setTimeout(r, 5));
    const ep2 = await store.record({ agentId: agentA, action: 'a2', outcome: 'o2' });
    const within = await store.getBetween(agentA, ep1.createdAt, ep2.createdAt);
    expect(within.length).toBe(2);
  });

  it('get returns the episode by id; undefined if missing', async () => {
    const ep = await store.record({ agentId: agentA, action: 'x', outcome: 'y' });
    const found = await store.get(ep.id);
    expect(found?.id).toBe(ep.id);
    const missing = await store.get(randomUUID() as (typeof ep)['id']);
    expect(missing).toBeUndefined();
  });

  it('deleteBefore removes only episodes older than the cutoff and only for that agent', async () => {
    const old = await store.record({ agentId: agentA, action: 'old', outcome: 'o' });
    await new Promise((r) => setTimeout(r, 10));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    await new Promise((r) => setTimeout(r, 10));
    await store.record({ agentId: agentA, action: 'new', outcome: 'o' });
    await store.record({ agentId: agentB, action: 'other-agent-old', outcome: 'o' });

    const removed = await store.deleteBefore(agentA, cutoff);
    expect(removed).toBe(1);
    expect(await store.get(old.id)).toBeUndefined();
    // Other agent's episodes untouched
    const b = await store.getRecent(agentB);
    expect(b).toHaveLength(1);
  });

  it('saveConsolidation + getConsolidations round-trip', async () => {
    const consolidation = await store.saveConsolidation({
      agentId: agentA,
      sourceEpisodeIds: [],
      summary: 'Handled 3 threads',
      lessons: ['be concise'],
      periodFrom: new Date('2026-04-01').toISOString() as IsoTimestamp,
      periodTo: new Date('2026-04-07').toISOString() as IsoTimestamp,
    });
    expect(consolidation.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(consolidation.consolidatedAt).toMatch(/^\d{4}-/);
    const list = await store.getConsolidations(agentA);
    expect(list).toHaveLength(1);
    expect(list[0]?.summary).toBe('Handled 3 threads');
  });

  it('getConsolidations returns latest-first and respects limit', async () => {
    for (let i = 0; i < 4; i++) {
      await store.saveConsolidation({
        agentId: agentA,
        sourceEpisodeIds: [],
        summary: `summary-${i}`,
        lessons: [],
        periodFrom: new Date().toISOString() as IsoTimestamp,
        periodTo: new Date().toISOString() as IsoTimestamp,
      });
    }
    const list = await store.getConsolidations(agentA, 2);
    expect(list).toHaveLength(2);
    expect(list[0]?.summary).toBe('summary-3');
  });
});
```

- [ ] **Step 2.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test episodic-store
```

Expected: module not found.

- [ ] **Step 2.3: Implement `packages/engine/src/memory/episodic-store.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow, type IsoTimestamp } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';
import type {
  ConsolidatedMemory,
  Episode,
  NewConsolidatedMemory,
  NewEpisode,
} from './types.js';

/**
 * Persistence contract for episodic memory. Plan 07 provides a Drizzle-backed
 * implementation; `InMemoryEpisodicStore` below is a reference + test impl.
 */
export interface EpisodicMemoryStore {
  record(episode: NewEpisode): Promise<Episode>;
  get(id: MemoryId): Promise<Episode | undefined>;
  getRecent(agentId: AgentId, limit?: number): Promise<readonly Episode[]>;
  getBetween(
    agentId: AgentId,
    from: IsoTimestamp,
    to: IsoTimestamp,
  ): Promise<readonly Episode[]>;
  /** Returns number of episodes removed. */
  deleteBefore(agentId: AgentId, cutoff: IsoTimestamp): Promise<number>;

  saveConsolidation(input: NewConsolidatedMemory): Promise<ConsolidatedMemory>;
  getConsolidations(agentId: AgentId, limit?: number): Promise<readonly ConsolidatedMemory[]>;
}

const DEFAULT_RECENT_LIMIT = 50;

export class InMemoryEpisodicStore implements EpisodicMemoryStore {
  readonly #episodes = new Map<MemoryId, Episode>();
  readonly #consolidations = new Map<MemoryId, ConsolidatedMemory>();

  async record(input: NewEpisode): Promise<Episode> {
    const episode: Episode = {
      id: randomUUID() as MemoryId,
      agentId: input.agentId,
      action: input.action,
      outcome: input.outcome,
      lesson: input.lesson,
      sentiment: input.sentiment ?? 'neutral',
      context: input.context,
      metadata: input.metadata,
      createdAt: isoNow(),
    };
    this.#episodes.set(episode.id, episode);
    return episode;
  }

  async get(id: MemoryId): Promise<Episode | undefined> {
    return this.#episodes.get(id);
  }

  async getRecent(agentId: AgentId, limit = DEFAULT_RECENT_LIMIT): Promise<readonly Episode[]> {
    return this.#filter(agentId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .slice(0, limit);
  }

  async getBetween(
    agentId: AgentId,
    from: IsoTimestamp,
    to: IsoTimestamp,
  ): Promise<readonly Episode[]> {
    return this.#filter(agentId)
      .filter((ep) => ep.createdAt >= from && ep.createdAt <= to)
      .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  }

  async deleteBefore(agentId: AgentId, cutoff: IsoTimestamp): Promise<number> {
    let removed = 0;
    for (const ep of this.#filter(agentId)) {
      if (ep.createdAt < cutoff) {
        this.#episodes.delete(ep.id);
        removed += 1;
      }
    }
    return removed;
  }

  async saveConsolidation(input: NewConsolidatedMemory): Promise<ConsolidatedMemory> {
    const consolidation: ConsolidatedMemory = {
      ...input,
      id: randomUUID() as MemoryId,
      consolidatedAt: isoNow(),
    };
    this.#consolidations.set(consolidation.id, consolidation);
    return consolidation;
  }

  async getConsolidations(
    agentId: AgentId,
    limit = DEFAULT_RECENT_LIMIT,
  ): Promise<readonly ConsolidatedMemory[]> {
    return Array.from(this.#consolidations.values())
      .filter((c) => c.agentId === agentId)
      .sort((a, b) => (a.consolidatedAt < b.consolidatedAt ? 1 : -1))
      .slice(0, limit);
  }

  #filter(agentId: AgentId): Episode[] {
    const out: Episode[] = [];
    for (const ep of this.#episodes.values()) {
      if (ep.agentId === agentId) out.push(ep);
    }
    return out;
  }
}
```

- [ ] **Step 2.4: Run test — MUST PASS + commit**

```bash
mkdir -p packages/engine/tests/memory
pnpm --filter @advocate/engine test episodic-store
pnpm lint
git add packages/engine/src/memory/ packages/engine/tests/memory/
git commit -m "feat(engine): add EpisodicMemoryStore with in-memory implementation"
```

---

## Task 3: Relational Memory Store

**Files:**
- Create: `packages/engine/src/memory/relational-store.ts`
- Create: `packages/engine/tests/memory/relational-store.test.ts`

- [ ] **Step 3.1: Write failing test FIRST**

Create `packages/engine/tests/memory/relational-store.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryRelationalStore } from '../../src/memory/relational-store.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;
const agentB = randomUUID() as AgentId;

describe('InMemoryRelationalStore', () => {
  let store: InMemoryRelationalStore;

  beforeEach(() => {
    store = new InMemoryRelationalStore();
  });

  it('upsert creates a new relationship with defaults', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'replied to my PEX thread',
    });
    expect(rel.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(rel.sentiment).toBe('neutral');
    expect(rel.interactionCount).toBe(1);
    expect(rel.tags).toEqual([]);
    expect(rel.lastInteractionAt).toMatch(/^\d{4}-/);
  });

  it('upsert on the same (agent, platform, username) updates, not duplicates', async () => {
    const first = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'first meeting',
    });
    await new Promise((r) => setTimeout(r, 5));
    const second = await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'second interaction',
      sentiment: 'positive',
    });
    expect(second.id).toBe(first.id);
    expect(second.interactionCount).toBe(2);
    expect(second.sentiment).toBe('positive');
    expect(second.context).toBe('second interaction');
    expect(second.lastInteractionAt >= first.lastInteractionAt).toBe(true);

    const all = await store.listForAgent(agentA);
    expect(all).toHaveLength(1);
  });

  it('the same username under a different platform is a different relationship', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'reddit',
      context: 'reddit',
    });
    await store.upsert({
      agentId: agentA,
      externalUsername: 'copper_joe',
      platform: 'twitter',
      context: 'twitter',
    });
    const all = await store.listForAgent(agentA);
    expect(all).toHaveLength(2);
  });

  it('relationships are scoped per agent', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    await store.upsert({
      agentId: agentB,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    expect(await store.listForAgent(agentA)).toHaveLength(1);
    expect(await store.listForAgent(agentB)).toHaveLength(1);
  });

  it('findByUsername returns the right row or undefined', async () => {
    await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    const found = await store.findByUsername(agentA, 'reddit', 'u');
    expect(found?.externalUsername).toBe('u');
    expect(await store.findByUsername(agentA, 'reddit', 'missing')).toBeUndefined();
  });

  it('updateSentiment changes only the sentiment field', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: 'x',
    });
    const updated = await store.updateSentiment(rel.id, 'negative');
    expect(updated.sentiment).toBe('negative');
    expect(updated.context).toBe('x');
    expect(updated.interactionCount).toBe(1);
  });

  it('incrementInteraction bumps count + lastInteractionAt', async () => {
    const rel = await store.upsert({
      agentId: agentA,
      externalUsername: 'u',
      platform: 'reddit',
      context: '',
    });
    await new Promise((r) => setTimeout(r, 5));
    const bumped = await store.incrementInteraction(rel.id);
    expect(bumped.interactionCount).toBe(2);
    expect(bumped.lastInteractionAt >= rel.lastInteractionAt).toBe(true);
  });

  it('updateSentiment on unknown id throws', async () => {
    await expect(
      store.updateSentiment(randomUUID() as (typeof agentA) & { __brand: 'MemoryId' }, 'positive'),
    ).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 3.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test relational-store
```

- [ ] **Step 3.3: Implement `packages/engine/src/memory/relational-store.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, MemoryId } from '../types/ids.js';
import type { NewRelationship, Relationship, Sentiment } from './types.js';

export interface RelationalMemoryStore {
  /** Creates on first call; increments interactionCount and refreshes fields on subsequent calls. */
  upsert(input: NewRelationship): Promise<Relationship>;
  get(id: MemoryId): Promise<Relationship | undefined>;
  findByUsername(
    agentId: AgentId,
    platform: string,
    externalUsername: string,
  ): Promise<Relationship | undefined>;
  listForAgent(agentId: AgentId): Promise<readonly Relationship[]>;
  updateSentiment(id: MemoryId, sentiment: Sentiment): Promise<Relationship>;
  incrementInteraction(id: MemoryId): Promise<Relationship>;
}

function key(agentId: AgentId, platform: string, username: string): string {
  return `${agentId}::${platform}::${username}`;
}

export class InMemoryRelationalStore implements RelationalMemoryStore {
  readonly #byId = new Map<MemoryId, Relationship>();
  readonly #byLookup = new Map<string, MemoryId>();

  async upsert(input: NewRelationship): Promise<Relationship> {
    const lookup = key(input.agentId, input.platform, input.externalUsername);
    const existingId = this.#byLookup.get(lookup);
    if (existingId) {
      const existing = this.#byId.get(existingId);
      if (!existing) throw new Error('index inconsistency: id present, row missing');
      const updated: Relationship = {
        ...existing,
        context: input.context,
        sentiment: input.sentiment ?? existing.sentiment,
        notes: input.notes ?? existing.notes,
        tags: input.tags ?? existing.tags,
        interactionCount: existing.interactionCount + 1,
        lastInteractionAt: isoNow(),
      };
      this.#byId.set(existing.id, updated);
      return updated;
    }

    const created: Relationship = {
      id: randomUUID() as MemoryId,
      agentId: input.agentId,
      externalUsername: input.externalUsername,
      platform: input.platform,
      context: input.context,
      sentiment: input.sentiment ?? 'neutral',
      interactionCount: 1,
      lastInteractionAt: isoNow(),
      notes: input.notes,
      tags: input.tags ?? [],
    };
    this.#byId.set(created.id, created);
    this.#byLookup.set(lookup, created.id);
    return created;
  }

  async get(id: MemoryId): Promise<Relationship | undefined> {
    return this.#byId.get(id);
  }

  async findByUsername(
    agentId: AgentId,
    platform: string,
    externalUsername: string,
  ): Promise<Relationship | undefined> {
    const id = this.#byLookup.get(key(agentId, platform, externalUsername));
    return id ? this.#byId.get(id) : undefined;
  }

  async listForAgent(agentId: AgentId): Promise<readonly Relationship[]> {
    const out: Relationship[] = [];
    for (const rel of this.#byId.values()) {
      if (rel.agentId === agentId) out.push(rel);
    }
    return out.sort((a, b) => (a.lastInteractionAt < b.lastInteractionAt ? 1 : -1));
  }

  async updateSentiment(id: MemoryId, sentiment: Sentiment): Promise<Relationship> {
    const existing = this.#byId.get(id);
    if (!existing) throw new Error(`Relationship ${id} not found`);
    const updated: Relationship = { ...existing, sentiment };
    this.#byId.set(id, updated);
    return updated;
  }

  async incrementInteraction(id: MemoryId): Promise<Relationship> {
    const existing = this.#byId.get(id);
    if (!existing) throw new Error(`Relationship ${id} not found`);
    const updated: Relationship = {
      ...existing,
      interactionCount: existing.interactionCount + 1,
      lastInteractionAt: isoNow(),
    };
    this.#byId.set(id, updated);
    return updated;
  }
}
```

- [ ] **Step 3.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test relational-store
pnpm lint
git add packages/engine/src/memory/relational-store.ts packages/engine/tests/memory/relational-store.test.ts
git commit -m "feat(engine): add RelationalMemoryStore with in-memory implementation"
```

---

## Task 4: Memory Consolidator

**Files:**
- Create: `packages/engine/src/memory/consolidator.ts`
- Create: `packages/engine/tests/memory/consolidator.test.ts`

- [ ] **Step 4.1: Write failing test FIRST**

Create `packages/engine/tests/memory/consolidator.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NaiveMemoryConsolidator } from '../../src/memory/consolidator.js';
import { InMemoryEpisodicStore } from '../../src/memory/episodic-store.js';
import type { IsoTimestamp } from '../../src/types/common.js';
import type { AgentId } from '../../src/types/ids.js';

const agentA = randomUUID() as AgentId;

describe('NaiveMemoryConsolidator', () => {
  let store: InMemoryEpisodicStore;
  let consolidator: NaiveMemoryConsolidator;

  beforeEach(() => {
    store = new InMemoryEpisodicStore();
    consolidator = new NaiveMemoryConsolidator(store);
  });

  it('is a no-op when fewer episodes than minEpisodes match', async () => {
    await store.record({ agentId: agentA, action: 'a', outcome: 'o' });
    const result = await consolidator.consolidate(agentA, {
      olderThan: new Date(Date.now() + 10_000).toISOString() as IsoTimestamp,
      minEpisodes: 5,
    });
    expect(result.consolidation).toBeUndefined();
    expect(result.episodesRemoved).toBe(0);

    // Episode is still there.
    expect((await store.getRecent(agentA)).length).toBe(1);
  });

  it('is a no-op when there are zero candidate episodes', async () => {
    const result = await consolidator.consolidate(agentA, {
      olderThan: new Date().toISOString() as IsoTimestamp,
    });
    expect(result.consolidation).toBeUndefined();
    expect(result.episodesRemoved).toBe(0);
  });

  it('consolidates qualifying old episodes, deletes them, keeps newer ones', async () => {
    const old1 = await store.record({
      agentId: agentA,
      action: 'commented on r/Plumbing',
      outcome: '12 upvotes',
      lesson: 'specific prices resonate',
    });
    await new Promise((r) => setTimeout(r, 5));
    const old2 = await store.record({
      agentId: agentA,
      action: 'posted to r/HVAC',
      outcome: '5 upvotes',
    });
    await new Promise((r) => setTimeout(r, 10));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    await new Promise((r) => setTimeout(r, 10));
    const keep = await store.record({ agentId: agentA, action: 'newer', outcome: 'recent' });

    const result = await consolidator.consolidate(agentA, {
      olderThan: cutoff,
      minEpisodes: 2,
    });

    expect(result.episodesRemoved).toBe(2);
    expect(result.consolidation).toBeDefined();
    expect(result.consolidation?.sourceEpisodeIds).toEqual(
      expect.arrayContaining([old1.id, old2.id]),
    );
    expect(result.consolidation?.summary).toContain('r/Plumbing');
    expect(result.consolidation?.lessons).toContain('specific prices resonate');

    // Source episodes gone
    expect(await store.get(old1.id)).toBeUndefined();
    expect(await store.get(old2.id)).toBeUndefined();
    // Newer preserved
    expect((await store.get(keep.id))?.id).toBe(keep.id);
    // Consolidation persisted
    const saved = await store.getConsolidations(agentA);
    expect(saved).toHaveLength(1);
  });

  it('applies the default minEpisodes of 1 when not provided', async () => {
    await store.record({ agentId: agentA, action: 'solo', outcome: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    const cutoff = new Date().toISOString() as IsoTimestamp;
    const result = await consolidator.consolidate(agentA, { olderThan: cutoff });
    expect(result.episodesRemoved).toBe(1);
    expect(result.consolidation).toBeDefined();
  });
});
```

- [ ] **Step 4.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test consolidator
```

- [ ] **Step 4.3: Implement `packages/engine/src/memory/consolidator.ts`**

```typescript
import type { IsoTimestamp } from '../types/common.js';
import type { AgentId } from '../types/ids.js';
import type { EpisodicMemoryStore } from './episodic-store.js';
import type { ConsolidatedMemory } from './types.js';

export interface ConsolidateOptions {
  /** Consolidate episodes older than this timestamp. */
  olderThan: IsoTimestamp;
  /** Minimum candidate episodes to bother consolidating; below this it's a no-op. Default 1. */
  minEpisodes?: number;
}

export interface ConsolidationResult {
  /** The new summary row, or undefined if the call was a no-op. */
  consolidation?: ConsolidatedMemory;
  /** Count of raw episodes deleted in favor of the summary. */
  episodesRemoved: number;
}

/**
 * Strategy for compressing old episodes into summaries. The default
 * `NaiveMemoryConsolidator` implementation concatenates actions/outcomes
 * without LLM help — sufficient for tests and for a non-LLM fallback.
 * Plan 06 will add `LlmMemoryConsolidator` backed by the router.
 */
export interface MemoryConsolidator {
  consolidate(agentId: AgentId, options: ConsolidateOptions): Promise<ConsolidationResult>;
}

export class NaiveMemoryConsolidator implements MemoryConsolidator {
  constructor(private readonly store: EpisodicMemoryStore) {}

  async consolidate(agentId: AgentId, options: ConsolidateOptions): Promise<ConsolidationResult> {
    const minEpisodes = options.minEpisodes ?? 1;

    // Pull everything and filter ourselves — the store doesn't have a "before"
    // query. For in-memory and small N this is fine; the Plan 07 Drizzle store
    // will expose a proper before-cutoff query.
    const all = await this.store.getRecent(agentId, Number.POSITIVE_INFINITY);
    const candidates = all.filter((ep) => ep.createdAt < options.olderThan);

    if (candidates.length < minEpisodes) {
      return { episodesRemoved: 0 };
    }

    // Oldest-first for readable summary output.
    const ordered = [...candidates].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const first = ordered[0]!;
    const last = ordered[ordered.length - 1]!;

    const summary = ordered.map((ep) => `• ${ep.action} → ${ep.outcome}`).join('\n');
    const lessons = ordered
      .map((ep) => ep.lesson)
      .filter((l): l is string => Boolean(l && l.trim().length > 0));

    const consolidation = await this.store.saveConsolidation({
      agentId,
      sourceEpisodeIds: ordered.map((ep) => ep.id),
      summary,
      lessons,
      periodFrom: first.createdAt,
      periodTo: last.createdAt,
    });

    const removed = await this.store.deleteBefore(agentId, options.olderThan);

    return { consolidation, episodesRemoved: removed };
  }
}
```

- [ ] **Step 4.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test consolidator
pnpm lint
git add packages/engine/src/memory/consolidator.ts packages/engine/tests/memory/consolidator.test.ts
git commit -m "feat(engine): add MemoryConsolidator with naive (non-LLM) default"
```

---

## Task 5: Task Types + Status Transitions

**Files:**
- Create: `packages/engine/src/tasks/types.ts`
- Create: `packages/engine/src/tasks/transitions.ts`
- Create: `packages/engine/tests/tasks/transitions.test.ts`

- [ ] **Step 5.1: Create `packages/engine/src/tasks/types.ts`**

```typescript
import type { IsoTimestamp } from '../types/common.js';
import type { AgentId, ProjectId, TaskId } from '../types/ids.js';

export type TaskStatus =
  | 'backlog'
  | 'in_progress'
  | 'in_review'
  | 'approved'
  | 'done'
  | 'blocked';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: TaskId;
  projectId: ProjectId;
  title: string;
  description: string;
  /** Application-defined task type (e.g. 'content_draft', 'research'). */
  type: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo?: AgentId;
  createdBy: AgentId;
  dependsOn: readonly TaskId[];
  createdAt: IsoTimestamp;
  startedAt?: IsoTimestamp;
  completedAt?: IsoTimestamp;
}

export interface NewTask {
  projectId: ProjectId;
  title: string;
  description: string;
  type: string;
  priority?: TaskPriority;
  assignedTo?: AgentId;
  createdBy: AgentId;
  dependsOn?: readonly TaskId[];
}

export interface TaskFilter {
  projectId?: ProjectId;
  assignedTo?: AgentId;
  status?: TaskStatus;
  type?: string;
}

export interface TaskComment {
  id: string;
  taskId: TaskId;
  agentId: AgentId;
  agentRole: string;
  content: string;
  createdAt: IsoTimestamp;
}

export interface TaskArtifact {
  id: string;
  taskId: TaskId;
  /** Application-defined artifact type (e.g. 'content_draft', 'analysis_report'). */
  type: string;
  content: string;
  createdBy: AgentId;
  createdAt: IsoTimestamp;
}

export interface NewArtifact {
  type: string;
  content: string;
  createdBy: AgentId;
}
```

- [ ] **Step 5.2: Create `packages/engine/src/tasks/transitions.ts`**

```typescript
import type { TaskStatus } from './types.js';

/**
 * Allowed task status transitions. The kanban board consults this map before
 * every `updateStatus` call; illegal transitions throw with a readable error.
 *
 * - backlog       → in_progress, blocked
 * - in_progress   → in_review, blocked, backlog (revert)
 * - in_review     → approved, in_progress (rework), blocked
 * - approved      → done
 * - done          → (terminal)
 * - blocked       → backlog, in_progress
 */
export const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['in_progress', 'blocked'],
  in_progress: ['in_review', 'blocked', 'backlog'],
  in_review: ['approved', 'in_progress', 'blocked'],
  approved: ['done'],
  done: [],
  blocked: ['backlog', 'in_progress'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true; // self-transition is a no-op, allowed
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(public readonly from: TaskStatus, public readonly to: TaskStatus) {
    super(`Illegal task transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}
```

- [ ] **Step 5.3: Create `packages/engine/tests/tasks/transitions.test.ts`**

```typescript
import { describe, expect, it } from 'vitest';
import { IllegalTransitionError, canTransition } from '../../src/tasks/transitions.js';

describe('task status transitions', () => {
  it('allows backlog → in_progress', () => {
    expect(canTransition('backlog', 'in_progress')).toBe(true);
  });

  it('rejects backlog → done', () => {
    expect(canTransition('backlog', 'done')).toBe(false);
  });

  it('allows self-transition (idempotent updates)', () => {
    expect(canTransition('in_progress', 'in_progress')).toBe(true);
  });

  it('allows in_review → in_progress (rework loop)', () => {
    expect(canTransition('in_review', 'in_progress')).toBe(true);
  });

  it('done is terminal', () => {
    expect(canTransition('done', 'backlog')).toBe(false);
    expect(canTransition('done', 'in_progress')).toBe(false);
    expect(canTransition('done', 'approved')).toBe(false);
  });

  it('approved can only go to done', () => {
    expect(canTransition('approved', 'done')).toBe(true);
    expect(canTransition('approved', 'in_progress')).toBe(false);
    expect(canTransition('approved', 'backlog')).toBe(false);
  });

  it('blocked can recover to backlog or in_progress', () => {
    expect(canTransition('blocked', 'backlog')).toBe(true);
    expect(canTransition('blocked', 'in_progress')).toBe(true);
    expect(canTransition('blocked', 'done')).toBe(false);
  });

  it('IllegalTransitionError carries from/to + name', () => {
    const err = new IllegalTransitionError('done', 'backlog');
    expect(err.from).toBe('done');
    expect(err.to).toBe('backlog');
    expect(err.name).toBe('IllegalTransitionError');
    expect(err.message).toContain('done');
    expect(err.message).toContain('backlog');
  });
});
```

- [ ] **Step 5.4: Typecheck + test + commit**

```bash
mkdir -p packages/engine/tests/tasks
pnpm --filter @advocate/engine typecheck
pnpm --filter @advocate/engine test transitions
pnpm lint
git add packages/engine/src/tasks/ packages/engine/tests/tasks/
git commit -m "feat(engine): add task types + status transition rules"
```

---

## Task 6: Kanban Board

**Files:**
- Create: `packages/engine/src/tasks/board.ts`
- Create: `packages/engine/tests/tasks/board.test.ts`

- [ ] **Step 6.1: Write failing test FIRST**

Create `packages/engine/tests/tasks/board.test.ts`:

```typescript
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryKanbanBoard } from '../../src/tasks/board.js';
import type { AgentId, ProjectId, TaskId } from '../../src/types/ids.js';

const actor = randomUUID() as AgentId;
const assignee = randomUUID() as AgentId;
const project = randomUUID() as ProjectId;

describe('InMemoryKanbanBoard', () => {
  let board: InMemoryKanbanBoard;

  beforeEach(() => {
    board = new InMemoryKanbanBoard();
  });

  it('createTask assigns id, createdAt, default priority + status, empty deps', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 'Review content',
      description: 'Check for promo smell',
      type: 'content_review',
      createdBy: actor,
    });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.priority).toBe('medium');
    expect(task.status).toBe('backlog');
    expect(task.dependsOn).toEqual([]);
    expect(task.createdAt).toMatch(/^\d{4}-/);
  });

  it('listTasks filters by projectId, assignedTo, status, type', async () => {
    const otherProject = randomUUID() as ProjectId;
    await board.createTask({
      projectId: project,
      title: 't1',
      description: '',
      type: 'x',
      createdBy: actor,
      assignedTo: assignee,
    });
    await board.createTask({
      projectId: otherProject,
      title: 't2',
      description: '',
      type: 'y',
      createdBy: actor,
    });
    expect(await board.listTasks({ projectId: project })).toHaveLength(1);
    expect(await board.listTasks({ projectId: otherProject, type: 'y' })).toHaveLength(1);
    expect(await board.listTasks({ assignedTo: assignee })).toHaveLength(1);
    expect(await board.listTasks({ status: 'done' })).toHaveLength(0);
  });

  it('updateStatus enforces transitions + stamps startedAt/completedAt', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const started = await board.updateStatus(task.id, 'in_progress', actor);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBeDefined();

    const inReview = await board.updateStatus(task.id, 'in_review', actor);
    const approved = await board.updateStatus(inReview.id, 'approved', actor);
    const done = await board.updateStatus(approved.id, 'done', actor);
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeDefined();
  });

  it('updateStatus rejects illegal transitions with IllegalTransitionError', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    await expect(board.updateStatus(task.id, 'done', actor)).rejects.toThrow(/Illegal/);
  });

  it('updateStatus throws on unknown taskId', async () => {
    await expect(
      board.updateStatus(randomUUID() as TaskId, 'in_progress', actor),
    ).rejects.toThrow(/not found/);
  });

  it('assign updates assignedTo', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const assigned = await board.assign(task.id, assignee);
    expect(assigned.assignedTo).toBe(assignee);
  });

  it('addComment + getComments', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    await board.addComment(task.id, actor, 'looks good', 'reviewer');
    await board.addComment(task.id, assignee, 'agreed', 'content_writer');
    const comments = await board.getComments(task.id);
    expect(comments).toHaveLength(2);
    expect(comments[0]?.content).toBe('looks good');
    expect(comments[0]?.agentRole).toBe('reviewer');
  });

  it('addArtifact + getArtifacts', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const artifact = await board.addArtifact(task.id, {
      type: 'content_draft',
      content: 'Hey folks...',
      createdBy: assignee,
    });
    expect(artifact.id).toMatch(/^[0-9a-f-]{36}$/);
    const artifacts = await board.getArtifacts(task.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.content).toContain('Hey folks');
  });

  it('addComment / addArtifact throw on unknown taskId', async () => {
    const missing = randomUUID() as TaskId;
    await expect(board.addComment(missing, actor, 'x', 'role')).rejects.toThrow(/not found/);
    await expect(
      board.addArtifact(missing, { type: 't', content: 'c', createdBy: actor }),
    ).rejects.toThrow(/not found/);
  });
});
```

- [ ] **Step 6.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/engine test board
```

- [ ] **Step 6.3: Implement `packages/engine/src/tasks/board.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { isoNow } from '../types/common.js';
import type { AgentId, TaskId } from '../types/ids.js';
import { IllegalTransitionError, canTransition } from './transitions.js';
import type {
  NewArtifact,
  NewTask,
  Task,
  TaskArtifact,
  TaskComment,
  TaskFilter,
  TaskStatus,
} from './types.js';

/**
 * Task board contract. The board is the authoritative owner of task state —
 * it validates transitions, stamps lifecycle timestamps, and records comments
 * and artifacts against tasks.
 */
export interface KanbanBoard {
  createTask(input: NewTask): Promise<Task>;
  getTask(id: TaskId): Promise<Task | undefined>;
  listTasks(filter?: TaskFilter): Promise<readonly Task[]>;
  updateStatus(id: TaskId, status: TaskStatus, actor: AgentId): Promise<Task>;
  assign(id: TaskId, toAgentId: AgentId): Promise<Task>;
  addComment(
    taskId: TaskId,
    agentId: AgentId,
    content: string,
    agentRole: string,
  ): Promise<TaskComment>;
  addArtifact(taskId: TaskId, artifact: NewArtifact): Promise<TaskArtifact>;
  getComments(taskId: TaskId): Promise<readonly TaskComment[]>;
  getArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]>;
}

export class InMemoryKanbanBoard implements KanbanBoard {
  readonly #tasks = new Map<TaskId, Task>();
  readonly #comments = new Map<TaskId, TaskComment[]>();
  readonly #artifacts = new Map<TaskId, TaskArtifact[]>();

  async createTask(input: NewTask): Promise<Task> {
    const now = isoNow();
    const task: Task = {
      id: randomUUID() as TaskId,
      projectId: input.projectId,
      title: input.title,
      description: input.description,
      type: input.type,
      priority: input.priority ?? 'medium',
      status: 'backlog',
      assignedTo: input.assignedTo,
      createdBy: input.createdBy,
      dependsOn: input.dependsOn ?? [],
      createdAt: now,
    };
    this.#tasks.set(task.id, task);
    return task;
  }

  async getTask(id: TaskId): Promise<Task | undefined> {
    return this.#tasks.get(id);
  }

  async listTasks(filter: TaskFilter = {}): Promise<readonly Task[]> {
    const out: Task[] = [];
    for (const task of this.#tasks.values()) {
      if (filter.projectId && task.projectId !== filter.projectId) continue;
      if (filter.assignedTo && task.assignedTo !== filter.assignedTo) continue;
      if (filter.status && task.status !== filter.status) continue;
      if (filter.type && task.type !== filter.type) continue;
      out.push(task);
    }
    return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async updateStatus(id: TaskId, status: TaskStatus, _actor: AgentId): Promise<Task> {
    const task = this.#mustGet(id);
    if (!canTransition(task.status, status)) {
      throw new IllegalTransitionError(task.status, status);
    }

    const now = isoNow();
    const startedAt = task.startedAt ?? (status === 'in_progress' ? now : undefined);
    const completedAt = task.completedAt ?? (status === 'done' ? now : undefined);

    const updated: Task = { ...task, status, startedAt, completedAt };
    this.#tasks.set(id, updated);
    return updated;
  }

  async assign(id: TaskId, toAgentId: AgentId): Promise<Task> {
    const task = this.#mustGet(id);
    const updated: Task = { ...task, assignedTo: toAgentId };
    this.#tasks.set(id, updated);
    return updated;
  }

  async addComment(
    taskId: TaskId,
    agentId: AgentId,
    content: string,
    agentRole: string,
  ): Promise<TaskComment> {
    this.#mustGet(taskId); // assert task exists
    const comment: TaskComment = {
      id: randomUUID(),
      taskId,
      agentId,
      agentRole,
      content,
      createdAt: isoNow(),
    };
    const list = this.#comments.get(taskId) ?? [];
    list.push(comment);
    this.#comments.set(taskId, list);
    return comment;
  }

  async addArtifact(taskId: TaskId, input: NewArtifact): Promise<TaskArtifact> {
    this.#mustGet(taskId);
    const artifact: TaskArtifact = {
      id: randomUUID(),
      taskId,
      type: input.type,
      content: input.content,
      createdBy: input.createdBy,
      createdAt: isoNow(),
    };
    const list = this.#artifacts.get(taskId) ?? [];
    list.push(artifact);
    this.#artifacts.set(taskId, list);
    return artifact;
  }

  async getComments(taskId: TaskId): Promise<readonly TaskComment[]> {
    return [...(this.#comments.get(taskId) ?? [])];
  }

  async getArtifacts(taskId: TaskId): Promise<readonly TaskArtifact[]> {
    return [...(this.#artifacts.get(taskId) ?? [])];
  }

  #mustGet(id: TaskId): Task {
    const task = this.#tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);
    return task;
  }
}
```

- [ ] **Step 6.4: Run test + commit**

```bash
pnpm --filter @advocate/engine test board
pnpm lint
git add packages/engine/src/tasks/board.ts packages/engine/tests/tasks/board.test.ts
git commit -m "feat(engine): add KanbanBoard with transition-enforced in-memory implementation"
```

---

## Task 7: Barrel Updates + Docker Verification

**Files:**
- Create: `packages/engine/src/memory/index.ts`
- Create: `packages/engine/src/tasks/index.ts`
- Modify: `packages/engine/src/index.ts`

- [ ] **Step 7.1: Create memory barrel**

`packages/engine/src/memory/index.ts`:

```typescript
export * from './consolidator.js';
export * from './episodic-store.js';
export * from './relational-store.js';
export * from './types.js';
```

- [ ] **Step 7.2: Create tasks barrel**

`packages/engine/src/tasks/index.ts`:

```typescript
export * from './board.js';
export * from './transitions.js';
export * from './types.js';
```

- [ ] **Step 7.3: Extend public barrel `packages/engine/src/index.ts`**

Append (do not replace — keep existing Plan 03 exports):

```typescript
// Memory
export {
  InMemoryEpisodicStore,
  type EpisodicMemoryStore,
} from './memory/episodic-store.js';
export {
  InMemoryRelationalStore,
  type RelationalMemoryStore,
} from './memory/relational-store.js';
export {
  NaiveMemoryConsolidator,
  type ConsolidateOptions,
  type ConsolidationResult,
  type MemoryConsolidator,
} from './memory/consolidator.js';
export type {
  ConsolidatedMemory,
  Episode,
  NewConsolidatedMemory,
  NewEpisode,
  NewRelationship,
  Relationship,
  Sentiment,
} from './memory/types.js';

// Tasks
export { InMemoryKanbanBoard, type KanbanBoard } from './tasks/board.js';
export {
  IllegalTransitionError,
  TRANSITIONS,
  canTransition,
} from './tasks/transitions.js';
export type {
  NewArtifact,
  NewTask,
  Task,
  TaskArtifact,
  TaskComment,
  TaskFilter,
  TaskPriority,
  TaskStatus,
} from './tasks/types.js';
```

Biome will resort these alphabetically on save; that's fine.

- [ ] **Step 7.4: Verify full suite**

```bash
pnpm --filter @advocate/engine typecheck
pnpm --filter @advocate/engine build
pnpm --filter @advocate/engine test
pnpm lint
```

Expected: engine now has 18 (prior) + ~11 episodic + ~7 relational + ~4 consolidator + ~8 transitions + ~8 board ≈ 56 tests passing.

- [ ] **Step 7.5: Commit + push**

```bash
git add packages/engine/src/
git commit -m "feat(engine): expose memory + tasks via public barrel"
git push origin master
```

---

## Task 8: Docker Round-Trip + Tag

- [ ] **Step 8.1: Rebuild and boot the full stack**

```bash
docker compose down
docker compose up -d --build
```

- [ ] **Step 8.2: Wait for health**

Wait up to 60 seconds for `advocate-api` to report healthy. Check:

```bash
docker compose ps
```

All three services must show `healthy`.

- [ ] **Step 8.3: Verify the API**

```bash
curl -s http://localhost:36401/health
```

Must return `{"status":"ok","checks":{"database":true,"redis":true}}`.

- [ ] **Step 8.4: Confirm migration logs look correct**

```bash
docker compose logs api | grep -E "(migrations|Server listening)" | head -5
```

Should show "running migrations" → "migrations complete" → "Server listening at http://127.0.0.1:3000".

- [ ] **Step 8.5: Stop the stack (keep data)**

```bash
docker compose down
```

- [ ] **Step 8.6: Tag + push**

```bash
git tag -a plan04-complete -m "Plan 04 Engine Memory + Tasks complete"
git push origin plan04-complete
```

---

## Acceptance Criteria

1. ✅ EpisodicMemoryStore + InMemoryEpisodicStore shipped with tests
2. ✅ RelationalMemoryStore + InMemoryRelationalStore shipped with tests
3. ✅ MemoryConsolidator + NaiveMemoryConsolidator shipped with tests
4. ✅ KanbanBoard + InMemoryKanbanBoard shipped with transition enforcement + tests
5. ✅ Status transitions covered by dedicated tests
6. ✅ All engine types exported via public barrel
7. ✅ `pnpm verify` passes
8. ✅ Docker stack boots healthy, `/health` returns ok
9. ✅ Tag `plan04-complete` pushed to origin

## Out of Scope

- Drizzle-backed implementations → Plan 07 (StorageProvider abstraction)
- LLM-driven consolidation → Plan 06
- Agent messaging bus → Plan 05
- Heartbeat scheduler → Plan 05

---

**End of Plan 04 (Engine: Memory + Tasks).**
