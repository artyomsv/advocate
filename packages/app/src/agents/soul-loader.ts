import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { SEED_AGENT_IDS, type SeedAgentRole } from '../bootstrap/seed-agents.js';
import type * as schema from '../db/schema.js';
import { agents } from '../db/schema.js';

/**
 * Short-lived in-memory cache of the `agents.soul` column, keyed by agent
 * UUID. Agents call `resolveSoul` at the start of each LLM call to pick up
 * operator edits without a restart. TTL is 30s — small enough that an
 * edit made in the dashboard shows up on the next orchestrator run.
 */
const TTL_MS = 30_000;

interface CacheEntry {
  soul: string;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Resolve the system prompt for a roster agent. Returns the DB `soul` if
 * non-empty, otherwise the passed `fallback` (the hardcoded constant that
 * ships in code). This lets the soul-in-DB rollout land without a forced
 * migration step — fresh installs keep working until an operator edits.
 */
export async function resolveSoul(
  db: NodePgDatabase<typeof schema>,
  role: SeedAgentRole,
  fallback: string,
): Promise<string> {
  const agentId = SEED_AGENT_IDS[role];
  const now = Date.now();
  const cached = cache.get(agentId);
  if (cached && now - cached.loadedAt < TTL_MS) {
    return cached.soul.trim() ? cached.soul : fallback;
  }
  // Unit tests pass a stub db that lacks .select; fall through to the
  // code default rather than blowing up.
  try {
    const [row] = await db
      .select({ soul: agents.soul })
      .from(agents)
      .where(eq(agents.id, agentId))
      .limit(1);
    const soul = row?.soul ?? '';
    cache.set(agentId, { soul, loadedAt: now });
    return soul.trim() ? soul : fallback;
  } catch {
    return fallback;
  }
}

/** Drop the cache entry — called after a PATCH so the next call re-reads. */
export function invalidateSoulCache(agentId: string): void {
  cache.delete(agentId);
}
