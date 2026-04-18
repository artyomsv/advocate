import { desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { consolidatedMemories } from '../db/schema.js';

/**
 * Short-lived cache of the most recent consolidated lessons per agent.
 * 5-minute TTL is the sweet spot: lessons change slowly (daily cron at
 * most) so staleness is tolerable, but fresh enough that an operator-
 * triggered consolidation flows through to the next few runs.
 */
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  lessons: string[];
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function loadLessons(
  db: NodePgDatabase<typeof schema>,
  agentId: string,
  max = 15,
): Promise<string[]> {
  const now = Date.now();
  const cached = cache.get(agentId);
  if (cached && now - cached.loadedAt < TTL_MS) return cached.lessons;

  try {
    const rows = await db
      .select({ lessons: consolidatedMemories.lessons })
      .from(consolidatedMemories)
      .where(eq(consolidatedMemories.agentId, agentId))
      .orderBy(desc(consolidatedMemories.consolidatedAt))
      .limit(5);
    const flat = rows.flatMap((r) => r.lessons).slice(0, max);
    cache.set(agentId, { lessons: flat, loadedAt: now });
    return flat;
  } catch {
    // Stub dbs in unit tests lack `.select`; be defensive.
    return [];
  }
}

export function formatLessons(lessons: readonly string[]): string {
  if (lessons.length === 0) return '';
  return (
    '\n\nLESSONS FROM PAST RUNS (shared across products — craft observations only):\n' +
    lessons.map((l) => `- ${l}`).join('\n')
  );
}

export function invalidateLessonsCache(agentId?: string): void {
  if (agentId) cache.delete(agentId);
  else cache.clear();
}
