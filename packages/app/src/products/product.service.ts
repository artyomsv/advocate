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

  #parse<T>(
    schema: {
      safeParse(input: unknown): {
        success: boolean;
        data?: T;
        error?: { issues: { path: (string | number)[]; message: string }[] };
      };
    },
    input: unknown,
  ): T {
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
