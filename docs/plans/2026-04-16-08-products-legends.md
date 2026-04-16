# Products + Legends CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** First plan that produces user-visible functionality. Adds Drizzle-backed repositories + validation-layer services for the `products` and `legends` tables, exposes them via a minimal set of Fastify routes (no auth yet — Plan 12 adds Keycloak), and ships integration tests that exercise the real stack (Postgres + API) end-to-end. After this plan, you can `curl -X POST http://localhost:36401/products` and get an actual created row back.

**Architecture:** Standard three-layer cake: **repository** (Drizzle queries only, no validation) → **service** (Zod validation, cross-cutting concerns like slug uniqueness) → **route** (Fastify plugin wiring HTTP request/response to service calls). Errors from lower layers become specific Fastify error responses with deterministic status codes. Accounts/credentials CRUD are deferred to Plan 08.5 to keep scope manageable.

**Tech Stack:** Drizzle ORM · Fastify 5 · Zod 3 · pg driver already wired from Plan 01

**Prerequisites:**
- Plan 07 complete (tag `plan07-complete`)
- Branch: `master`
- Working directory: `E:/Projects/Stukans/advocate`
- Postgres running: `docker compose up -d postgres redis`

---

## File Structure Overview

```
packages/app/src/products/
├── index.ts
├── types.ts                        # ProductInput, ProductUpdate, re-exports of Drizzle inferred types
├── validation.ts                   # Zod schemas for ProductInput + ProductUpdate
├── errors.ts                       # ProductNotFoundError, DuplicateSlugError
├── product.repository.ts           # ProductRepository (Drizzle query wrapper)
└── product.service.ts              # ProductService (validation + repo orchestration)

packages/app/src/legends/
├── index.ts
├── types.ts
├── validation.ts
├── errors.ts
├── legend.repository.ts
└── legend.service.ts

packages/app/src/server/routes/
├── health.ts                       # (existing)
├── products.ts                     # NEW — POST, GET list, GET by id, PATCH, DELETE
└── legends.ts                      # NEW — same

packages/app/tests/products/
├── product.service.test.ts         # Unit: validation, error mapping
└── products.integration.test.ts    # Integration: boot server, POST + GET round-trip

packages/app/tests/legends/
├── legend.service.test.ts
└── legends.integration.test.ts
```

## Design decisions

1. **Repository = Drizzle-only.** No Zod, no business rules, no thrown domain errors. It does selects and inserts. This keeps the integration test surface thin.

2. **Service = validation + orchestration.** Parses input with Zod, calls repository, maps DB-level errors (unique constraint violation) to domain errors (`DuplicateSlugError`). Agents will call services directly in later plans — never repositories.

3. **Route = thin HTTP shim.** Fastify routes translate between wire format and service calls. They use Fastify's `setErrorHandler` to convert `DuplicateSlugError` → 409, `ProductNotFoundError` → 404, etc.

4. **Slug is mandatory + unique.** The DB already has `products.slug UNIQUE`. Services validate the slug pattern (`^[a-z0-9-]{3,100}$`) and map the DB unique violation to `DuplicateSlugError`.

5. **jsonb columns accept arrays of strings.** Service input takes `string[]`; repository stores as jsonb. Drizzle's `.$type<string[]>()` annotation handles the marshalling.

6. **No pagination yet.** `listProducts` returns all rows. With < 10 expected products in the lifetime of the project, pagination is premature. Legends may grow larger — we'll add pagination when actually needed.

7. **Integration tests use real Postgres.** `buildServer()` is already test-friendly (via `app.inject()` from Plan 01). Tests use unique slugs with a timestamp prefix and clean up after themselves (no synthetic data lingers).

---

## Task 1: Product Errors + Validation

**Files:**
- Create: `packages/app/src/products/errors.ts`
- Create: `packages/app/src/products/validation.ts`
- Create: `packages/app/src/products/types.ts`

- [ ] **Step 1.1: Create errors module**

`packages/app/src/products/errors.ts`:

```typescript
/**
 * Domain errors raised by the product service. Routes map these to HTTP
 * status codes in the error handler.
 */

export class ProductNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Product ${id} not found`);
    this.name = 'ProductNotFoundError';
  }
}

export class DuplicateSlugError extends Error {
  constructor(public readonly slug: string) {
    super(`Product with slug "${slug}" already exists`);
    this.name = 'DuplicateSlugError';
  }
}

export class ProductValidationError extends Error {
  constructor(public readonly issues: readonly { path: string; message: string }[]) {
    super(`Product validation failed: ${issues.map((i) => i.path).join(', ')}`);
    this.name = 'ProductValidationError';
  }
}
```

- [ ] **Step 1.2: Create validation module**

`packages/app/src/products/validation.ts`:

```typescript
import { z } from 'zod';

/**
 * Zod schema for creating a product. The service uses this to validate
 * incoming API payloads and agent inputs alike.
 *
 * `slug` matches DB check: lowercase alphanumeric + hyphen, 3-100 chars.
 */
export const productInputSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'slug must be lowercase alphanumeric with hyphens'),
  description: z.string().min(1),
  url: z.string().url().optional(),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  valueProps: z.array(z.string().min(1)).default([]),
  painPoints: z.array(z.string().min(1)).default([]),
  talkingPoints: z.array(z.string().min(1)).default([]),
  competitorComparisons: z
    .array(z.object({ name: z.string().min(1), comparison: z.string().min(1) }))
    .optional(),
  neverSay: z.array(z.string().min(1)).optional(),
  targetAudiences: z
    .array(z.object({ segment: z.string().min(1), platforms: z.array(z.string().min(1)) }))
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type ProductInput = z.infer<typeof productInputSchema>;

/** Update schema — everything optional except `id` (which is the URL param). */
export const productUpdateSchema = productInputSchema.partial().extend({
  slug: productInputSchema.shape.slug.optional(),
});

export type ProductUpdate = z.infer<typeof productUpdateSchema>;
```

- [ ] **Step 1.3: Create types re-export**

`packages/app/src/products/types.ts`:

```typescript
export type { Product, NewProduct } from '../db/schema.js';
export type { ProductInput, ProductUpdate } from './validation.js';
```

- [ ] **Step 1.4: Typecheck + commit**

```bash
cd E:/Projects/Stukans/advocate
pnpm --filter @advocate/app typecheck
git add packages/app/src/products/
git commit -m "feat(app): add product validation schemas + domain errors"
```

---

## Task 2: Product Repository

**Files:**
- Create: `packages/app/src/products/product.repository.ts`
- Create: `packages/app/tests/products/product.repository.test.ts`

- [ ] **Step 2.1: Write failing integration test FIRST**

Create `packages/app/tests/products/product.repository.test.ts`:

```typescript
import { eq, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, closeDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import { ProductRepository } from '../../src/products/product.repository.js';

const TEST_SLUG_PREFIX = 'canary-repo-';

async function cleanupCanaries(): Promise<void> {
  const db = getDb();
  await db.delete(products).where(like(products.slug, `${TEST_SLUG_PREFIX}%`));
}

describe('ProductRepository', () => {
  const repo = new ProductRepository(getDb());

  beforeEach(cleanupCanaries);
  afterEach(cleanupCanaries);
  afterAll(async () => {
    await cleanupCanaries();
    await closeDb();
  });

  it('create inserts a row and returns it with id + timestamps', async () => {
    const row = await repo.create({
      name: 'Fairy Book Store',
      slug: `${TEST_SLUG_PREFIX}create`,
      description: 'Personalized children\'s books',
      status: 'draft',
      valueProps: ['personalized'],
      painPoints: ['generic books'],
      talkingPoints: ['your child as the hero'],
    });
    expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.slug).toBe(`${TEST_SLUG_PREFIX}create`);
    expect(row.valueProps).toEqual(['personalized']);
  });

  it('findById returns null for missing id', async () => {
    const row = await repo.findById('00000000-0000-4000-8000-000000000000');
    expect(row).toBeNull();
  });

  it('findBySlug returns the row when present', async () => {
    await repo.create({
      name: 'X',
      slug: `${TEST_SLUG_PREFIX}find`,
      description: 'x',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const found = await repo.findBySlug(`${TEST_SLUG_PREFIX}find`);
    expect(found?.name).toBe('X');
  });

  it('list returns only rows with the canary prefix (when filtered)', async () => {
    await repo.create({
      name: 'A',
      slug: `${TEST_SLUG_PREFIX}list-a`,
      description: 'a',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await repo.create({
      name: 'B',
      slug: `${TEST_SLUG_PREFIX}list-b`,
      description: 'b',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const all = await repo.list();
    const canaries = all.filter((p) => p.slug.startsWith(TEST_SLUG_PREFIX));
    expect(canaries).toHaveLength(2);
  });

  it('update patches only provided fields and bumps updatedAt', async () => {
    const created = await repo.create({
      name: 'Orig',
      slug: `${TEST_SLUG_PREFIX}update`,
      description: 'orig',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await new Promise((r) => setTimeout(r, 10));
    const updated = await repo.update(created.id, { name: 'Renamed' });
    expect(updated?.name).toBe('Renamed');
    expect(updated?.description).toBe('orig');
    expect(updated && updated.updatedAt > created.updatedAt).toBe(true);
  });

  it('update returns null for missing id', async () => {
    const result = await repo.update('00000000-0000-4000-8000-000000000000', { name: 'X' });
    expect(result).toBeNull();
  });

  it('remove deletes the row and returns true; repeat returns false', async () => {
    const created = await repo.create({
      name: 'Del',
      slug: `${TEST_SLUG_PREFIX}remove`,
      description: 'd',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    expect(await repo.remove(created.id)).toBe(true);
    expect(await repo.remove(created.id)).toBe(false);
  });

  it('unique slug constraint surfaces as a Postgres error the caller can catch', async () => {
    const slug = `${TEST_SLUG_PREFIX}dup`;
    await repo.create({
      name: 'A',
      slug,
      description: 'a',
      status: 'draft',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await expect(
      repo.create({
        name: 'B',
        slug,
        description: 'b',
        status: 'draft',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2.2: Run — MUST FAIL (module not found)**

```bash
mkdir -p packages/app/tests/products
pnpm --filter @advocate/app test product.repository
```

- [ ] **Step 2.3: Implement `packages/app/src/products/product.repository.ts`**

```typescript
import { eq, desc } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { products, type Product, type NewProduct } from '../db/schema.js';
import type * as schema from '../db/schema.js';

/**
 * Thin Drizzle query wrapper. Does NOT validate inputs — the service layer
 * does. Does NOT map DB errors to domain errors — callers handle that.
 */
export class ProductRepository {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async create(input: NewProduct): Promise<Product> {
    const [row] = await this.db.insert(products).values(input).returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  }

  async findById(id: string): Promise<Product | null> {
    const [row] = await this.db.select().from(products).where(eq(products.id, id)).limit(1);
    return row ?? null;
  }

  async findBySlug(slug: string): Promise<Product | null> {
    const [row] = await this.db.select().from(products).where(eq(products.slug, slug)).limit(1);
    return row ?? null;
  }

  async list(): Promise<readonly Product[]> {
    return this.db.select().from(products).orderBy(desc(products.createdAt));
  }

  async update(id: string, patch: Partial<NewProduct>): Promise<Product | null> {
    const [row] = await this.db
      .update(products)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(products.id, id))
      .returning();
    return row ?? null;
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.db.delete(products).where(eq(products.id, id)).returning({ id: products.id });
    return result.length > 0;
  }
}
```

- [ ] **Step 2.4: Run test + commit**

Ensure Postgres is up: `docker compose up -d postgres redis`.

```bash
pnpm --filter @advocate/app test product.repository
pnpm lint
git add packages/app/src/products/product.repository.ts packages/app/tests/products/product.repository.test.ts
git commit -m "feat(app): add Drizzle-backed ProductRepository with integration tests"
```

---

## Task 3: Product Service

**Files:**
- Create: `packages/app/src/products/product.service.ts`
- Create: `packages/app/tests/products/product.service.test.ts`

- [ ] **Step 3.1: Write failing test FIRST**

Create `packages/app/tests/products/product.service.test.ts`:

```typescript
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { getDb, closeDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../src/products/errors.js';
import { ProductService } from '../../src/products/product.service.js';

const PREFIX = 'canary-svc-';

async function cleanup(): Promise<void> {
  await getDb().delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('ProductService', () => {
  const service = new ProductService(getDb());

  beforeEach(cleanup);
  afterEach(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it('create stores and returns a valid product', async () => {
    const product = await service.create({
      name: 'Fairy Book Store',
      slug: `${PREFIX}create`,
      description: 'Children\'s books',
      valueProps: ['personalized'],
      painPoints: ['generic'],
      talkingPoints: ['custom'],
    });
    expect(product.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(product.slug).toBe(`${PREFIX}create`);
    expect(product.status).toBe('draft');
  });

  it('create throws ProductValidationError on invalid slug', async () => {
    await expect(
      service.create({
        name: 'X',
        slug: 'Bad Slug!', // spaces + uppercase + punctuation
        description: 'x',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toBeInstanceOf(ProductValidationError);
  });

  it('create throws DuplicateSlugError on existing slug', async () => {
    await service.create({
      name: 'A',
      slug: `${PREFIX}dup`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await expect(
      service.create({
        name: 'B',
        slug: `${PREFIX}dup`,
        description: 'b',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      }),
    ).rejects.toBeInstanceOf(DuplicateSlugError);
  });

  it('get throws ProductNotFoundError when id is unknown', async () => {
    await expect(service.get('00000000-0000-4000-8000-000000000000')).rejects.toBeInstanceOf(
      ProductNotFoundError,
    );
  });

  it('update validates patch + returns updated row', async () => {
    const created = await service.create({
      name: 'A',
      slug: `${PREFIX}upd`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    const updated = await service.update(created.id, { name: 'Renamed' });
    expect(updated.name).toBe('Renamed');
  });

  it('update throws ProductNotFoundError on missing id', async () => {
    await expect(
      service.update('00000000-0000-4000-8000-000000000000', { name: 'X' }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });

  it('remove returns void on success, throws on missing id', async () => {
    const created = await service.create({
      name: 'A',
      slug: `${PREFIX}rm`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    });
    await service.remove(created.id);
    await expect(service.remove(created.id)).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
```

- [ ] **Step 3.2: Run test — MUST FAIL**

```bash
pnpm --filter @advocate/app test product.service
```

- [ ] **Step 3.3: Implement `packages/app/src/products/product.service.ts`**

```typescript
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import type { Product } from '../db/schema.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from './errors.js';
import { ProductRepository } from './product.repository.js';
import { productInputSchema, productUpdateSchema } from './validation.js';

export class ProductService {
  readonly #repo: ProductRepository;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#repo = new ProductRepository(db);
  }

  async create(input: unknown): Promise<Product> {
    const parsed = this.#parse(productInputSchema, input);
    try {
      return await this.#repo.create(parsed);
    } catch (err) {
      if (this.#isUniqueViolation(err)) {
        throw new DuplicateSlugError(parsed.slug);
      }
      throw err;
    }
  }

  async get(id: string): Promise<Product> {
    const row = await this.#repo.findById(id);
    if (!row) throw new ProductNotFoundError(id);
    return row;
  }

  async getBySlug(slug: string): Promise<Product | null> {
    return this.#repo.findBySlug(slug);
  }

  async list(): Promise<readonly Product[]> {
    return this.#repo.list();
  }

  async update(id: string, patch: unknown): Promise<Product> {
    const parsed = this.#parse(productUpdateSchema, patch);
    try {
      const row = await this.#repo.update(id, parsed);
      if (!row) throw new ProductNotFoundError(id);
      return row;
    } catch (err) {
      if (this.#isUniqueViolation(err) && parsed.slug) {
        throw new DuplicateSlugError(parsed.slug);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const removed = await this.#repo.remove(id);
    if (!removed) throw new ProductNotFoundError(id);
  }

  #parse<T>(schema: { safeParse(input: unknown): { success: boolean; data?: T; error?: { issues: { path: (string | number)[]; message: string }[] } } }, input: unknown): T {
    const result = schema.safeParse(input);
    if (!result.success) {
      const issues = (result.error?.issues ?? []).map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw new ProductValidationError(issues);
    }
    return result.data as T;
  }

  #isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    );
  }
}
```

- [ ] **Step 3.4: Run test + commit**

```bash
pnpm --filter @advocate/app test product.service
pnpm lint
git add packages/app/src/products/product.service.ts packages/app/tests/products/product.service.test.ts
git commit -m "feat(app): add ProductService with Zod validation + domain error mapping"
```

---

## Task 4: Product Routes

**Files:**
- Create: `packages/app/src/server/routes/products.ts`
- Create: `packages/app/tests/products/products.integration.test.ts`
- Modify: `packages/app/src/server/server.ts` (register the new route plugin)

- [ ] **Step 4.1: Write failing integration test FIRST**

Create `packages/app/tests/products/products.integration.test.ts`:

```typescript
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { like } from 'drizzle-orm';
import { buildServer } from '../../src/server/server.js';
import { getDb } from '../../src/db/connection.js';
import { products } from '../../src/db/schema.js';

const PREFIX = 'canary-http-';

async function cleanup(): Promise<void> {
  await getDb().delete(products).where(like(products.slug, `${PREFIX}%`));
}

describe('/products routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
  });

  beforeEach(cleanup);
  afterEach(cleanup);

  it('POST /products → 201 with created row', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'Fairy Book Store',
        slug: `${PREFIX}create`,
        description: 'Children\'s books',
        valueProps: ['personalized'],
        painPoints: ['generic books'],
        talkingPoints: ['custom characters'],
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json<{ id: string; slug: string }>();
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.slug).toBe(`${PREFIX}create`);
  });

  it('POST /products → 400 on invalid input', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/products',
      payload: { name: '' }, // missing required fields
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /products → 409 on duplicate slug', async () => {
    const body = {
      name: 'A',
      slug: `${PREFIX}dup`,
      description: 'a',
      valueProps: [],
      painPoints: [],
      talkingPoints: [],
    };
    await app.inject({ method: 'POST', url: '/products', payload: body });
    const second = await app.inject({ method: 'POST', url: '/products', payload: body });
    expect(second.statusCode).toBe(409);
  });

  it('GET /products → 200 with array', async () => {
    await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}list`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const response = await app.inject({ method: 'GET', url: '/products' });
    expect(response.statusCode).toBe(200);
    const rows = response.json<{ slug: string }[]>();
    expect(rows.some((r) => r.slug === `${PREFIX}list`)).toBe(true);
  });

  it('GET /products/:id → 200 with row, 404 when missing', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}get`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const found = await app.inject({ method: 'GET', url: `/products/${id}` });
    expect(found.statusCode).toBe(200);

    const missing = await app.inject({
      method: 'GET',
      url: '/products/00000000-0000-4000-8000-000000000000',
    });
    expect(missing.statusCode).toBe(404);
  });

  it('PATCH /products/:id → 200 with updated row', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}patch`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const patched = await app.inject({
      method: 'PATCH',
      url: `/products/${id}`,
      payload: { name: 'Renamed' },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json<{ name: string }>().name).toBe('Renamed');
  });

  it('DELETE /products/:id → 204; repeat → 404', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'A',
        slug: `${PREFIX}del`,
        description: 'a',
        valueProps: [],
        painPoints: [],
        talkingPoints: [],
      },
    });
    const id = created.json<{ id: string }>().id;
    const first = await app.inject({ method: 'DELETE', url: `/products/${id}` });
    expect(first.statusCode).toBe(204);
    const second = await app.inject({ method: 'DELETE', url: `/products/${id}` });
    expect(second.statusCode).toBe(404);
  });
});
```

- [ ] **Step 4.2: Run — MUST FAIL (route doesn't exist yet; tests get 404 for POST)**

```bash
pnpm --filter @advocate/app test products.integration
```

- [ ] **Step 4.3: Implement `packages/app/src/server/routes/products.ts`**

```typescript
import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/connection.js';
import {
  DuplicateSlugError,
  ProductNotFoundError,
  ProductValidationError,
} from '../../products/errors.js';
import { ProductService } from '../../products/product.service.js';

interface IdParam {
  id: string;
}

export async function registerProductRoutes(app: FastifyInstance): Promise<void> {
  const service = new ProductService(getDb());

  app.post('/products', async (req, reply) => {
    try {
      const product = await service.create(req.body);
      return reply.code(201).send(product);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.get('/products', async () => {
    return service.list();
  });

  app.get<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      return await service.get(req.params.id);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.patch<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      return await service.update(req.params.id, req.body);
    } catch (err) {
      return mapError(reply, err);
    }
  });

  app.delete<{ Params: IdParam }>('/products/:id', async (req, reply) => {
    try {
      await service.remove(req.params.id);
      return reply.code(204).send();
    } catch (err) {
      return mapError(reply, err);
    }
  });
}

/**
 * Map domain errors to HTTP status codes. This stays local to the route file
 * rather than in a global error handler so the mapping is obvious at the call
 * site and testable without Fastify instance boilerplate.
 */
function mapError(reply: import('fastify').FastifyReply, err: unknown): import('fastify').FastifyReply {
  if (err instanceof ProductValidationError) {
    return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
  }
  if (err instanceof ProductNotFoundError) {
    return reply.code(404).send({ error: 'NotFound', id: err.id });
  }
  if (err instanceof DuplicateSlugError) {
    return reply.code(409).send({ error: 'Conflict', slug: err.slug });
  }
  reply.log.error({ err }, 'unhandled product route error');
  return reply.code(500).send({ error: 'InternalServerError' });
}
```

- [ ] **Step 4.4: Register the plugin in `packages/app/src/server/server.ts`**

Locate the existing line `await registerHealthRoutes(app);` and add `await registerProductRoutes(app);` right after it. Add the matching import at the top.

```typescript
import { registerProductRoutes } from './routes/products.js';
// ...
await registerHealthRoutes(app);
await registerProductRoutes(app);
```

- [ ] **Step 4.5: Run test + commit + push**

```bash
pnpm --filter @advocate/app test products.integration
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/products.ts packages/app/src/server/server.ts packages/app/tests/products/products.integration.test.ts
git commit -m "feat(app): add POST/GET/PATCH/DELETE /products routes with domain error mapping"
git push origin master
```

---

## Task 5: Legend Errors + Validation + Types

**Files:**
- Create: `packages/app/src/legends/errors.ts`
- Create: `packages/app/src/legends/validation.ts`
- Create: `packages/app/src/legends/types.ts`

Follow the same pattern as Task 1 (products). Legend validation is more complex because the shape has jsonb sub-structures. Use a nested Zod schema:

```typescript
// validation.ts
import { z } from 'zod';

const locationSchema = z.object({
  city: z.string().min(1),
  state: z.string().min(1),
  country: z.string().min(1),
  timezone: z.string().min(1),
});

const bigFiveSchema = z.object({
  openness: z.number().int().min(1).max(10),
  conscientiousness: z.number().int().min(1).max(10),
  extraversion: z.number().int().min(1).max(10),
  agreeableness: z.number().int().min(1).max(10),
  neuroticism: z.number().int().min(1).max(10),
});

const typingStyleSchema = z.object({
  capitalization: z.enum(['proper', 'lowercase', 'mixed']),
  punctuation: z.enum(['correct', 'minimal', 'excessive']),
  commonTypos: z.array(z.string()).default([]),
  commonPhrases: z.array(z.string()).default([]),
  avoidedPhrases: z.array(z.string()).default([]),
  paragraphStyle: z.enum(['short', 'walls_of_text', 'varied']),
  listStyle: z.enum(['never', 'sometimes', 'frequently']),
  usesEmojis: z.boolean(),
  formality: z.number().int().min(1).max(10),
});

const activeHoursSchema = z.object({
  start: z.number().int().min(0).max(23),
  end: z.number().int().min(0).max(23),
});

const lifeDetailsSchema = z.object({
  maritalStatus: z.enum(['single', 'married', 'divorced', 'partner']),
  partnerName: z.string().optional(),
  children: z.number().int().nonnegative().optional(),
}).passthrough();

const professionalSchema = z.object({
  occupation: z.string().min(1),
  company: z.string().min(1),
  industry: z.string().min(1),
  yearsExperience: z.number().int().nonnegative(),
  education: z.string().min(1),
}).passthrough();

const productRelationshipSchema = z.object({
  discoveryStory: z.string().min(1),
  usageDuration: z.string().min(1),
  satisfactionLevel: z.number().int().min(1).max(10),
  complaints: z.array(z.string()).default([]),
  useCase: z.string().min(1),
  alternativesConsidered: z.array(z.string()).default([]),
});

export const legendInputSchema = z.object({
  productId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  gender: z.enum(['male', 'female', 'non-binary']),
  age: z.number().int().min(18).max(120),
  location: locationSchema,
  lifeDetails: lifeDetailsSchema,
  professional: professionalSchema,
  bigFive: bigFiveSchema,
  techSavviness: z.number().int().min(1).max(10),
  typingStyle: typingStyleSchema,
  activeHours: activeHoursSchema,
  activeDays: z.array(z.number().int().min(0).max(6)).min(1),
  averagePostLength: z.enum(['short', 'medium', 'long']),
  hobbies: z.array(z.string()).min(1),
  otherInterests: z.record(z.string(), z.unknown()).optional(),
  expertiseAreas: z.array(z.string()).min(1),
  knowledgeGaps: z.array(z.string()).default([]),
  productRelationship: productRelationshipSchema,
  opinions: z.record(z.string(), z.string()).default({}),
  neverDo: z.array(z.string()).default([]),
  maturity: z.enum(['lurking', 'engaging', 'established', 'promoting']).default('lurking'),
  agentId: z.string().uuid().optional(),
});

export type LegendInput = z.infer<typeof legendInputSchema>;
export const legendUpdateSchema = legendInputSchema.partial();
export type LegendUpdate = z.infer<typeof legendUpdateSchema>;
```

`errors.ts` — exports `LegendNotFoundError`, `LegendValidationError`, `LegendProductNotFoundError` (FK violation).

`types.ts` — re-exports Drizzle types + input/update types.

- [ ] **Step 5.1: Create the three files following the product pattern**

See the spec sketch above for `validation.ts`. Mirror Task 1's error + types structure for `errors.ts` and `types.ts`.

- [ ] **Step 5.2: Typecheck + commit**

```bash
pnpm --filter @advocate/app typecheck
git add packages/app/src/legends/
git commit -m "feat(app): add legend validation schemas + domain errors"
```

---

## Task 6: Legend Repository

**Files:**
- Create: `packages/app/src/legends/legend.repository.ts`
- Create: `packages/app/tests/legends/legend.repository.test.ts`

Mirror the product repository. Key differences:

- Legend requires a `productId` FK — tests must create a parent product first
- `list` supports filtering by `productId` (most common access pattern)
- No unique-slug handling — legends don't have a slug

Repository interface:

```typescript
class LegendRepository {
  async create(input: NewLegend): Promise<Legend>;
  async findById(id: string): Promise<Legend | null>;
  async list(filter?: { productId?: string }): Promise<readonly Legend[]>;
  async update(id: string, patch: Partial<NewLegend>): Promise<Legend | null>;
  async remove(id: string): Promise<boolean>;
}
```

Integration test uses the SAME canary-prefix cleanup pattern, but tied to product creation first:

```typescript
// Create a test product, create legends under it, assert, clean up legends AND product
```

- [ ] **Step 6.1: Write failing tests FIRST, implement, commit**

```bash
mkdir -p packages/app/tests/legends
# write test file
pnpm --filter @advocate/app test legend.repository  # must fail
# implement repository
pnpm --filter @advocate/app test legend.repository  # must pass
pnpm lint
git add packages/app/src/legends/legend.repository.ts packages/app/tests/legends/legend.repository.test.ts
git commit -m "feat(app): add Drizzle-backed LegendRepository with integration tests"
```

---

## Task 7: Legend Service

**Files:**
- Create: `packages/app/src/legends/legend.service.ts`
- Create: `packages/app/tests/legends/legend.service.test.ts`

Mirror the product service. Additional handling needed:

- Catch FK violation on `productId` (Postgres code `23503`) → throw `LegendProductNotFoundError`
- Expose `listForProduct(productId)` as a dedicated method (common access pattern)

- [ ] **Step 7.1: TDD + commit**

```bash
pnpm --filter @advocate/app test legend.service  # must fail
# implement
pnpm --filter @advocate/app test legend.service  # must pass
pnpm lint
git add packages/app/src/legends/legend.service.ts packages/app/tests/legends/legend.service.test.ts
git commit -m "feat(app): add LegendService with Zod validation + FK error mapping"
```

---

## Task 8: Legend Routes

**Files:**
- Create: `packages/app/src/server/routes/legends.ts`
- Create: `packages/app/tests/legends/legends.integration.test.ts`
- Modify: `packages/app/src/server/server.ts`

Mirror the product routes:
- `POST /legends`, `GET /legends`, `GET /legends/:id`, `PATCH /legends/:id`, `DELETE /legends/:id`
- Additionally: `GET /products/:productId/legends` — list legends for a product

Error mapping:
- `LegendValidationError` → 400
- `LegendNotFoundError` → 404
- `LegendProductNotFoundError` → 400 (parent missing — client error)

- [ ] **Step 8.1: TDD + register + commit + push**

```bash
# write integration test, run, should fail
# implement route + register in server.ts
pnpm --filter @advocate/app test legends.integration
pnpm lint
pnpm --filter @advocate/app typecheck
git add packages/app/src/server/routes/legends.ts packages/app/src/server/server.ts packages/app/tests/legends/legends.integration.test.ts
git commit -m "feat(app): add /legends routes with GET /products/:id/legends convenience"
git push origin master
```

---

## Task 9: Barrel + Docker Round-Trip + Tag

- [ ] **Step 9.1: Create barrels**

```typescript
// packages/app/src/products/index.ts
export * from './errors.js';
export * from './product.repository.js';
export * from './product.service.js';
export * from './types.js';
export * from './validation.js';

// packages/app/src/legends/index.ts
export * from './errors.js';
export * from './legend.repository.js';
export * from './legend.service.js';
export * from './types.js';
export * from './validation.js';
```

- [ ] **Step 9.2: Verify full suite**

```bash
pnpm --filter @advocate/app typecheck
pnpm --filter @advocate/app test
pnpm lint
```

Expected: ~18 (existing) + ~40 new (repo + service + integration tests across both entities) ≈ 58 app tests.

- [ ] **Step 9.3: Commit barrels + push**

```bash
git add packages/app/src/products/index.ts packages/app/src/legends/index.ts
git commit -m "feat(app): expose products + legends via barrels"
git push origin master
```

- [ ] **Step 9.4: Docker round-trip + real-curl smoke test**

```bash
docker compose down
docker compose up -d --build
until [ "$(docker inspect --format '{{.State.Health.Status}}' advocate-api 2>/dev/null)" = "healthy" ]; do sleep 2; done
docker compose ps

# Verify health
curl -s http://localhost:36401/health

# Create a product for real via the API
curl -s -X POST http://localhost:36401/products \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Fairy Book Store",
    "slug": "fairybookstore",
    "description": "Personalized children books",
    "valueProps": ["personalized"],
    "painPoints": ["generic books"],
    "talkingPoints": ["your child as the hero"]
  }'

# List products — should include the row we just created
curl -s http://localhost:36401/products

# Clean up before teardown
curl -s -X DELETE http://localhost:36401/products/$(curl -s http://localhost:36401/products | jq -r '.[0].id')

docker compose down
```

Expected: first curl returns health JSON; POST returns the created row with `id` + `slug: "fairybookstore"`; GET returns an array containing it; DELETE returns 204.

**If `jq` is not installed on the host, replace the cleanup curl with a copy/paste of the `id` from the POST response.**

- [ ] **Step 9.5: Tag + push**

```bash
git tag -a plan08-complete -m "Plan 08 Products + Legends CRUD complete"
git push origin plan08-complete
```

---

## Acceptance Criteria

1. ✅ `products/` module ships: errors, validation, repository, service with integration tests
2. ✅ `legends/` module ships: errors, validation, repository, service with integration tests
3. ✅ `POST/GET/PATCH/DELETE /products` Fastify routes with domain error → HTTP mapping
4. ✅ `POST/GET/PATCH/DELETE /legends` + `GET /products/:id/legends` routes
5. ✅ `pnpm verify` passes with ~58 app tests
6. ✅ Docker stack boots healthy
7. ✅ `curl -X POST http://localhost:36401/products ...` creates a real row; `curl GET` returns it
8. ✅ Tag `plan08-complete` pushed

## Out of Scope

- **Legend accounts, email accounts, credentials** → Plan 08.5 (mirrors this plan's pattern for the three dependent tables with encryption for sensitive fields)
- **Auth / Keycloak** → Plan 12 — for now routes are open
- **Pagination** → add when actually needed (legend lists)
- **OpenAPI schema generation** → later, once the API stabilizes

---

**End of Plan 08 (Products + Legends CRUD).**
