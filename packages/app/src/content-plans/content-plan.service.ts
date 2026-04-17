import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import type { ContentPlan } from '../db/schema.js';
import { ContentPlanRepository } from './content-plan.repository.js';
import { ContentPlanNotFoundError, IllegalStatusTransitionError } from './errors.js';

export class ContentPlanService {
  readonly #repo: ContentPlanRepository;

  constructor(db: NodePgDatabase<typeof schema>) {
    this.#repo = new ContentPlanRepository(db);
  }

  async listByStatus(
    status: ContentPlan['status'],
    filter?: { legendId?: string },
  ): Promise<readonly ContentPlan[]> {
    return this.#repo.listByStatus(status, filter);
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
