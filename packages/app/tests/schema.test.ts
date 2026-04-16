import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../src/db/connection.js';
import {
  agentMessages,
  agents,
  agentTasks,
  campaigns,
  communities,
  consolidatedMemories,
  contentPlans,
  episodicMemories,
  heartbeatSchedules,
  legendAccounts,
  legendCredentials,
  legendEmailAccounts,
  legends,
  llmUsage,
  postMetricsHistory,
  posts,
  products,
  relationalMemories,
  safetyEvents,
  taskArtifacts,
  taskComments,
} from '../src/db/schema.js';

describe('database schema', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('all 20 tables are queryable (exist + have expected columns)', async () => {
    const db = getDb();
    // Each .select().limit(0) forces Postgres to resolve the table + columns
    // without returning rows. If the schema is mis-defined, the query errors.
    await Promise.all([
      db.select().from(agents).limit(0),
      db.select().from(agentTasks).limit(0),
      db.select().from(taskComments).limit(0),
      db.select().from(taskArtifacts).limit(0),
      db.select().from(agentMessages).limit(0),
      db.select().from(episodicMemories).limit(0),
      db.select().from(consolidatedMemories).limit(0),
      db.select().from(relationalMemories).limit(0),
      db.select().from(heartbeatSchedules).limit(0),
      db.select().from(safetyEvents).limit(0),
      db.select().from(llmUsage).limit(0),
      db.select().from(products).limit(0),
      db.select().from(legends).limit(0),
      db.select().from(legendAccounts).limit(0),
      db.select().from(legendEmailAccounts).limit(0),
      db.select().from(legendCredentials).limit(0),
      db.select().from(communities).limit(0),
      db.select().from(campaigns).limit(0),
      db.select().from(contentPlans).limit(0),
      db.select().from(posts).limit(0),
      db.select().from(postMetricsHistory).limit(0),
    ]);

    // If we got here, all tables exist and Drizzle types match columns.
    expect(true).toBe(true);
  });

  it('can insert + read a product row then delete it', async () => {
    const db = getDb();
    const [inserted] = await db
      .insert(products)
      .values({
        name: 'CANARY-schema-test',
        slug: `canary-${Date.now()}`,
        description: 'Integration test marker — deleted in same test.',
        valueProps: ['test'],
        painPoints: ['test'],
        talkingPoints: ['test'],
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted?.name).toBe('CANARY-schema-test');
    expect(inserted?.id).toMatch(/^[0-9a-f-]{36}$/);

    // Clean up — no synthetic data may persist past test execution.
    if (inserted?.id) {
      await db.delete(products).where(eq(products.id, inserted.id));
    }
  });
});
