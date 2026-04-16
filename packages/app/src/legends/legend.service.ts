import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import type { Legend } from '../db/schema.js';
import {
  LegendNotFoundError,
  LegendProductNotFoundError,
  LegendValidationError,
} from './errors.js';
import { LegendRepository } from './legend.repository.js';
import { legendInputSchema, legendUpdateSchema } from './validation.js';

export class LegendService {
  readonly #repo: LegendRepository;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#repo = new LegendRepository(db);
  }

  async create(input: unknown): Promise<Legend> {
    const parsed = this.#parse(legendInputSchema, input);
    try {
      return await this.#repo.create(parsed);
    } catch (err) {
      if (this.#isForeignKeyViolation(err)) {
        throw new LegendProductNotFoundError(parsed.productId);
      }
      throw err;
    }
  }

  async get(id: string): Promise<Legend> {
    const row = await this.#repo.findById(id);
    if (!row) throw new LegendNotFoundError(id);
    return row;
  }

  async list(filter?: { productId?: string }): Promise<readonly Legend[]> {
    return this.#repo.list(filter);
  }

  async listForProduct(productId: string): Promise<readonly Legend[]> {
    return this.#repo.list({ productId });
  }

  async update(id: string, patch: unknown): Promise<Legend> {
    const parsed = this.#parse(legendUpdateSchema, patch);
    try {
      const row = await this.#repo.update(id, parsed);
      if (!row) throw new LegendNotFoundError(id);
      return row;
    } catch (err) {
      if (this.#isForeignKeyViolation(err) && parsed.productId) {
        throw new LegendProductNotFoundError(parsed.productId);
      }
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    const removed = await this.#repo.remove(id);
    if (!removed) throw new LegendNotFoundError(id);
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
      throw new LegendValidationError(issues);
    }
    return result.data as T;
  }

  #isForeignKeyViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23503'
    );
  }
}
