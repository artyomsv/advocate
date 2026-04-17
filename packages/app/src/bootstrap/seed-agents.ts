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
} as const;

export type SeedAgentRole = keyof typeof SEED_AGENT_IDS;

interface SeedAgentSpec {
  id: string;
  name: string;
  role: string;
  soul: string;
}

const SPECS: readonly SeedAgentSpec[] = [
  {
    id: SEED_AGENT_IDS.campaignLead,
    name: 'Campaign Lead',
    role: 'campaign_lead',
    soul: 'Final decision-maker: post, revise, reject, or escalate.',
  },
  {
    id: SEED_AGENT_IDS.strategist,
    name: 'Strategist',
    role: 'strategist',
    soul: 'Picks legend + community + plan + promotion level.',
  },
  {
    id: SEED_AGENT_IDS.contentWriter,
    name: 'Content Writer',
    role: 'content_writer',
    soul: 'Drafts the post in the chosen legend\u2019s voice.',
  },
  {
    id: SEED_AGENT_IDS.qualityGate,
    name: 'Quality Gate',
    role: 'quality_gate',
    soul: 'LLM review + multi-axis scoring of drafts.',
  },
  {
    id: SEED_AGENT_IDS.safetyWorker,
    name: 'Safety Worker',
    role: 'safety_worker',
    soul: 'Rules-based safety checks (rate limits, bans, cooldowns).',
  },
  {
    id: SEED_AGENT_IDS.scout,
    name: 'Scout',
    role: 'scout',
    soul: 'Scans communities for relevant threads, scores each for dispatch.',
  },
  {
    id: SEED_AGENT_IDS.analyticsAnalyst,
    name: 'Analytics Analyst',
    role: 'analytics_analyst',
    soul: 'Reads post metrics, distills insights about what works per community.',
  },
];

/**
 * Idempotent upsert of the 5 orchestrator agents. Called at app startup
 * (server + worker). Uses ON CONFLICT DO NOTHING so repeat boots are no-ops.
 */
export async function ensureSeededAgents(
  db: NodePgDatabase<typeof schema>,
): Promise<void> {
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
}
