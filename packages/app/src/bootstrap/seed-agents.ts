import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { agents } from '../db/schema.js';

/**
 * Deterministic UUIDs for the 5-role orchestrator roster. Fixed so the
 * orchestrator can reference `fromAgent/toAgent` by constant without a
 * lookup round-trip, and so message thread history survives re-seeds.
 *
 * Namespace: first 8 bytes `00000000-0000-4000-a000` (a valid v4 shape).
 */
export const SEED_AGENT_IDS = {
  campaignLead: '00000000-0000-4000-a000-000000000001',
  strategist: '00000000-0000-4000-a000-000000000002',
  contentWriter: '00000000-0000-4000-a000-000000000003',
  qualityGate: '00000000-0000-4000-a000-000000000004',
  safetyWorker: '00000000-0000-4000-a000-000000000005',
  scout: '00000000-0000-4000-a000-000000000006',
  analyticsAnalyst: '00000000-0000-4000-a000-000000000007',
  memoryConsolidator: '00000000-0000-4000-a000-000000000008',
} as const;

export type SeedAgentRole = keyof typeof SEED_AGENT_IDS;

interface SeedAgentSpec {
  id: string;
  name: string;
  role: string;
  soul: string;
}

// Seed souls are empty — resolveSoul falls back to the code constants until
// an operator edits via /agents/:id/soul. That way the config UI always shows
// the live code default for un-overridden agents, and an override is visually
// distinct (green "overridden" badge).
const SPECS: readonly SeedAgentSpec[] = [
  { id: SEED_AGENT_IDS.campaignLead, name: 'Campaign Lead', role: 'campaign_lead', soul: '' },
  { id: SEED_AGENT_IDS.strategist, name: 'Strategist', role: 'strategist', soul: '' },
  { id: SEED_AGENT_IDS.contentWriter, name: 'Content Writer', role: 'content_writer', soul: '' },
  { id: SEED_AGENT_IDS.qualityGate, name: 'Quality Gate', role: 'quality_gate', soul: '' },
  { id: SEED_AGENT_IDS.safetyWorker, name: 'Safety Worker', role: 'safety_worker', soul: '' },
  { id: SEED_AGENT_IDS.scout, name: 'Scout', role: 'scout', soul: '' },
  {
    id: SEED_AGENT_IDS.analyticsAnalyst,
    name: 'Analytics Analyst',
    role: 'analytics_analyst',
    soul: '',
  },
  {
    id: SEED_AGENT_IDS.memoryConsolidator,
    name: 'Memory Consolidator',
    role: 'memory_consolidator',
    soul: '',
  },
];

/**
 * Idempotent upsert of the 5 orchestrator agents. Called at app startup
 * (server + worker). Uses ON CONFLICT DO NOTHING so repeat boots are no-ops.
 */
const LEGACY_PLACEHOLDER_SOULS = new Set<string>([
  'Final decision-maker: post, revise, reject, or escalate.',
  'Picks legend + community + plan + promotion level.',
  'Drafts the post in the chosen legend\u2019s voice.',
  'LLM review + multi-axis scoring of drafts.',
  'Rules-based safety checks (rate limits, bans, cooldowns).',
  'Scans communities for relevant threads, scores each for dispatch.',
  'Reads post metrics, distills insights about what works per community.',
]);

export async function ensureSeededAgents(db: NodePgDatabase<typeof schema>): Promise<void> {
  for (const spec of SPECS) {
    await db
      .insert(agents)
      .values({
        id: spec.id,
        name: spec.name,
        role: spec.role,
        soul: spec.soul,
        modelConfig: {},
        memoryConfig: {},
        permissions: [],
      })
      .onConflictDoNothing({ target: agents.id });
  }

  // One-time migration: wipe the old placeholder souls seeded before the
  // soul-in-DB rollout. Operator-edited souls stay untouched because they
  // won't match the placeholder set.
  const existing = await db
    .select({ id: agents.id, soul: agents.soul })
    .from(agents)
    .where(
      inArray(
        agents.id,
        SPECS.map((s) => s.id),
      ),
    );
  for (const row of existing) {
    if (LEGACY_PLACEHOLDER_SOULS.has(row.soul)) {
      await db
        .update(agents)
        .set({ soul: '' })
        .where(inArray(agents.id, [row.id]));
    }
  }
}
