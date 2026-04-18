import { eq } from 'drizzle-orm';
import { SEED_AGENT_IDS } from '../bootstrap/seed-agents.js';
import { BaseAgent } from './base-agent.js';
import { formatLessons, loadLessons } from './lessons-loader.js';
import { resolveSoul } from './soul-loader.js';
import type { AgentDeps } from './types.js';
import type { RedditClient, RedditThread } from '../reddit/client.js';
import {
  communities,
  discoveries,
  episodicMemories,
  legendAccounts,
  legends,
  products,
} from '../db/schema.js';

export interface ScoutDispatchInput {
  productId: string;
  communityId: string;
  /** threads scoring ≥ this get enqueued as orchestrator drafts */
  threshold?: number;
  /** how many threads to pull and score (Reddit caps listings at 100) */
  fetchLimit?: number;
}

export interface ScoutDispatchResult {
  scanned: number;
  dispatched: number;
  scores: Record<string, number>;
  legendAccountId: string | null;
}

export interface ScoreBatch {
  scores: Record<string, number>;
}

/**
 * Extract the JSON block from an LLM response. Accepts either a raw JSON
 * object or a code-fenced variant. Used by the Scout classifier prompt.
 */
export function parseScoreJson(raw: string): ScoreBatch {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1]!.trim() : trimmed;
  const parsed = JSON.parse(body) as { scores?: Record<string, unknown> };
  const scores: Record<string, number> = {};
  for (const [id, val] of Object.entries(parsed.scores ?? {})) {
    const n = Number(val);
    if (Number.isFinite(n)) scores[id] = Math.max(0, Math.min(10, n));
  }
  return { scores };
}

export class Scout extends BaseAgent {
  readonly name = 'scout';

  constructor(
    deps: AgentDeps,
    private readonly reddit: RedditClient,
  ) {
    super(deps);
  }

  async scanAndDispatch(
    input: ScoutDispatchInput,
    enqueueDraft: (params: {
      productId: string;
      legendId: string;
      communityId: string;
      threadContext: string;
    }) => Promise<void>,
  ): Promise<ScoutDispatchResult> {
    const threshold = input.threshold ?? 7;
    const fetchLimit = input.fetchLimit ?? 25;

    const [product] = await this.deps.db
      .select()
      .from(products)
      .where(eq(products.id, input.productId))
      .limit(1);
    if (!product) throw new Error(`product ${input.productId} not found`);

    const [community] = await this.deps.db
      .select()
      .from(communities)
      .where(eq(communities.id, input.communityId))
      .limit(1);
    if (!community) throw new Error(`community ${input.communityId} not found`);

    // Pick first active legend for this product + a legend_account on the platform
    const productLegends = await this.deps.db
      .select()
      .from(legends)
      .where(eq(legends.productId, input.productId));
    if (productLegends.length === 0) {
      return { scanned: 0, dispatched: 0, scores: {}, legendAccountId: null };
    }

    // Find legend_account for this platform. First legend with a matching
    // active account wins; within a legend, prefer isPrimary over secondary
    // accounts.
    let legendAccountId: string | null = null;
    let legendId: string | null = null;
    for (const l of productLegends) {
      const accounts = await this.deps.db
        .select()
        .from(legendAccounts)
        .where(eq(legendAccounts.legendId, l.id));
      const platformMatches = accounts.filter(
        (a) => a.platform === community.platform && a.status === 'active',
      );
      const match = platformMatches.find((a) => a.isPrimary) ?? platformMatches[0];
      if (match) {
        legendAccountId = match.id;
        legendId = l.id;
        break;
      }
    }
    if (!legendAccountId || !legendId) {
      return { scanned: 0, dispatched: 0, scores: {}, legendAccountId: null };
    }

    const threads = await this.reddit.fetchListing(
      legendAccountId,
      community.identifier,
      'hot',
      fetchLimit,
    );
    if (threads.length === 0) {
      return { scanned: 0, dispatched: 0, scores: {}, legendAccountId };
    }

    const prompt = buildScoringPrompt(product.name, product.valueProps as string[], threads);
    const defaultSoul =
      'You are a content-promotion scout. Given a product brief and a list of forum threads, ' +
      'score each thread 0-10 for how well the product genuinely fits the discussion. 10 = the ' +
      'OP is actively asking for this exact thing; 0 = unrelated.';
    const systemPrompt = await resolveSoul(this.deps.db, 'scout', defaultSoul);
    const lessons = await loadLessons(this.deps.db, SEED_AGENT_IDS.scout);
    const response = await this.callLlm({
      taskType: 'classification',
      systemPrompt,
      userPrompt: prompt + formatLessons(lessons),
      responseFormat: 'json',
      maxTokens: 512,
    });
    const { scores } = parseScoreJson(response.content);

    let dispatched = 0;
    for (const thread of threads) {
      const s = scores[thread.id] ?? 0;
      const willDispatch = s >= threshold;
      const reason = willDispatch
        ? `score ${s.toFixed(1)} ≥ threshold ${threshold.toFixed(1)}`
        : `score ${s.toFixed(1)} < threshold ${threshold.toFixed(1)}`;

      // Persist discovery row for every scored thread — keeps a trail for
      // threshold tuning + per-community accuracy analysis. DB-unique on
      // (platformThreadId, communityId) not enforced: the same thread can
      // legitimately be rescored on future scans.
      await this.deps.db.insert(discoveries).values({
        productId: input.productId,
        communityId: input.communityId,
        platformThreadId: thread.id,
        url: thread.permalink || null,
        title: thread.title,
        author: thread.author,
        snippet: thread.body.slice(0, 500) || null,
        score: s.toFixed(1),
        dispatched: willDispatch,
        dispatchReason: reason,
      });

      if (willDispatch) {
        const threadContext =
          `${thread.title}\n\n${thread.body.slice(0, 500)}`.trim() ||
          `Thread in r/${thread.subreddit} by u/${thread.author}`;
        await enqueueDraft({
          productId: input.productId,
          legendId,
          communityId: input.communityId,
          threadContext,
        });
        dispatched++;
      }
    }

    // Episodic memory — summarize the sweep so the operator can later see
    // Scout's cadence and hit-rate per community. Best-effort.
    try {
      await this.deps.db.insert(episodicMemories).values({
        agentId: '00000000-0000-4000-a000-000000000006',
        productId: input.productId,
        action: `Scanned r/${community.identifier} for ${product.name}`,
        outcome: `${threads.length} threads scored, ${dispatched} dispatched (threshold ${threshold.toFixed(1)})`,
        sentiment: dispatched > 0 ? 'positive' : 'neutral',
        context: {
          communityId: input.communityId,
          platform: community.platform,
        },
      });
    } catch {
      // advisory; never fails the scan
    }

    return { scanned: threads.length, dispatched, scores, legendAccountId };
  }
}

function buildScoringPrompt(
  productName: string,
  valueProps: readonly string[],
  threads: readonly RedditThread[],
): string {
  const lines = [
    `Product: ${productName}`,
    'Value props:',
    ...valueProps.map((v) => `  - ${v}`),
    '',
    'Threads to score (respond with JSON { "scores": { "<thread_id>": 0-10 } }):',
    '',
    ...threads.map(
      (t) => `[${t.id}] r/${t.subreddit} · u/${t.author} · "${t.title}" — ${t.body.slice(0, 240)}`,
    ),
  ];
  return lines.join('\n');
}
