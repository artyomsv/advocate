import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { type NewProduct, type Product, products } from '../db/schema.js';

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
    const result = await this.db
      .delete(products)
      .where(eq(products.id, id))
      .returning({ id: products.id });
    return result.length > 0;
  }
}
