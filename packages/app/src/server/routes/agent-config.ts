import type { FastifyInstance } from 'fastify';
import { CAMPAIGN_LEAD_SYSTEM_PROMPT } from '../../agents/campaign-lead.js';
import { QUALITY_GATE_SYSTEM_PROMPT } from '../../agents/quality-gate.js';
import { STRATEGIST_SYSTEM_PROMPT } from '../../agents/strategist.js';
import { getEnv } from '../../config/env.js';
import { createDefaultRouter, DEFAULT_ROUTES } from '../../llm/default-router.js';

interface AgentConfigEntry {
  agentId: string;
  name: string;
  role: string;
  taskType: string | null;
  systemPrompt: string;
  /**
   * When true, the systemPrompt above is assembled dynamically (soul + product
   * knowledge + context) per call — the string here is a description, not the
   * literal prompt.
   */
  dynamic: boolean;
}

const SCOUT_PROMPT =
  'You are a content-promotion scout. Given a product brief and a list of forum threads, ' +
  'score each thread 0-10 for how well the product genuinely fits the discussion. 10 = the ' +
  'OP is actively asking for this exact thing; 0 = unrelated.';

const ANALYTICS_PROMPT =
  'You are the Analytics Analyst for a content-promotion system. Produce concise, actionable learnings.';

const WRITER_DYNAMIC_DESCRIPTION =
  '[Dynamic: assembled per call by prompts/composer.ts] ' +
  'Layer 1 — Soul (legend identity built from legend.firstName/lastName/age/occupation, ' +
  'personality Big Five, writing style, expertise gaps, never-do list). ' +
  'Layer 2 — Product Knowledge (value props, pain points, talking points filtered by promotion level). ' +
  'Layer 3 — Context (community rules, thread summary, recent activity).';

const SAFETY_DESCRIPTION =
  '[Rules-based, no LLM] Evaluates legend_accounts row against configured limits: ' +
  'posts per day cap, minimum gap between posts, maturity-gated promotion level, ' +
  'account warm-up phase. Returns {allowed, reason, nextPossibleAt}.';

const AGENTS: readonly AgentConfigEntry[] = [
  {
    agentId: 'campaign-lead',
    name: 'Campaign Lead',
    role: 'Final decision: post, revise, reject, escalate',
    taskType: 'strategy',
    systemPrompt: CAMPAIGN_LEAD_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'strategist',
    name: 'Strategist',
    role: 'Picks legend + community + plan',
    taskType: 'strategy',
    systemPrompt: STRATEGIST_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'content-writer',
    name: 'Content Writer',
    role: 'Drafts the post in the chosen legend\u2019s voice',
    taskType: 'content_writing',
    systemPrompt: WRITER_DYNAMIC_DESCRIPTION,
    dynamic: true,
  },
  {
    agentId: 'quality-gate',
    name: 'Quality Gate',
    role: 'LLM review + multi-axis scoring',
    taskType: 'classification',
    systemPrompt: QUALITY_GATE_SYSTEM_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'safety-worker',
    name: 'Safety Worker',
    role: 'Rules-based account safety checks',
    taskType: null,
    systemPrompt: SAFETY_DESCRIPTION,
    dynamic: true,
  },
  {
    agentId: 'scout',
    name: 'Scout',
    role: 'Scans communities for dispatch candidates',
    taskType: 'classification',
    systemPrompt: SCOUT_PROMPT,
    dynamic: false,
  },
  {
    agentId: 'analytics-analyst',
    name: 'Analytics Analyst',
    role: 'Distills insights from post metrics',
    taskType: 'classification',
    systemPrompt: ANALYTICS_PROMPT,
    dynamic: false,
  },
];

export async function registerAgentConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agents/config', { preHandler: [app.authenticate] }, async () => {
    const env = getEnv();
    const { activeProviders } = createDefaultRouter({ env });

    return {
      mode: env.LLM_DEFAULT_MODE,
      activeProviders,
      routes: DEFAULT_ROUTES,
      agents: AGENTS,
    };
  });
}
