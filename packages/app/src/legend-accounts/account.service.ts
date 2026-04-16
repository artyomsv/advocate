import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { LegendAccount } from '../db/schema/app/legends.js';
import type * as schema from '../db/schema.js';
import { LegendAccountRepository } from './account.repository.js';
import {
  IllegalWarmUpTransitionError,
  LegendAccountLegendNotFoundError,
  LegendAccountNotFoundError,
  LegendAccountValidationError,
} from './errors.js';
import {
  canAdvanceWarmUp,
  legendAccountInputSchema,
  legendAccountUpdateSchema,
  type WarmUpPhase,
} from './validation.js';

export class LegendAccountService {
  readonly #repo: LegendAccountRepository;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#repo = new LegendAccountRepository(db);
  }

  async create(input: unknown): Promise<LegendAccount> {
    const parsed = this.#parse(legendAccountInputSchema, input);
    try {
      return await this.#repo.create(parsed);
    } catch (err) {
      if (this.#isFkViolation(err)) {
        throw new LegendAccountLegendNotFoundError(parsed.legendId);
      }
      throw err;
    }
  }

  async get(id: string): Promise<LegendAccount> {
    const row = await this.#repo.findById(id);
    if (!row) throw new LegendAccountNotFoundError(id);
    return row;
  }

  async list(filter?: { legendId?: string; platform?: string }) {
    return this.#repo.list(filter);
  }

  async update(id: string, patch: unknown): Promise<LegendAccount> {
    const parsed = this.#parse(legendAccountUpdateSchema, patch);
    const row = await this.#repo.update(id, parsed);
    if (!row) throw new LegendAccountNotFoundError(id);
    return row;
  }

  async remove(id: string): Promise<void> {
    const removed = await this.#repo.remove(id);
    if (!removed) throw new LegendAccountNotFoundError(id);
  }

  async advanceWarmUp(id: string, toPhase: WarmUpPhase): Promise<LegendAccount> {
    const current = await this.get(id);
    if (!canAdvanceWarmUp(current.warmUpPhase as WarmUpPhase, toPhase)) {
      throw new IllegalWarmUpTransitionError(current.warmUpPhase, toPhase);
    }
    const patch: Partial<LegendAccount> = { warmUpPhase: toPhase };
    if (toPhase === 'promoting') {
      patch.warmUpCompletedAt = new Date();
    }
    const row = await this.#repo.update(id, patch);
    if (!row) throw new LegendAccountNotFoundError(id);
    return row;
  }

  async recordPost(id: string, opts: { isProductMention?: boolean } = {}): Promise<LegendAccount> {
    const current = await this.get(id);
    const patch: Partial<LegendAccount> = {
      postsToday: current.postsToday + 1,
      postsThisWeek: current.postsThisWeek + 1,
      lastPostAt: new Date(),
    };
    if (opts.isProductMention) {
      patch.lastProductMentionAt = new Date();
    }
    const row = await this.#repo.update(id, patch);
    if (!row) throw new LegendAccountNotFoundError(id);
    return row;
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
      throw new LegendAccountValidationError(issues);
    }
    return result.data as T;
  }

  #isFkViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23503'
    );
  }
}
