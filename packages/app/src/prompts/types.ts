import type { Legend, Product } from '../db/schema.js';

/**
 * Runtime context: what's specific about THIS particular LLM call —
 * the thread, the community, the task, the memories.
 */
export interface PromptContext {
  /** What the persona is being asked to do this turn. */
  task: {
    type: string;
    /** 0-10 per the promotion gradient. */
    promotionLevel: number;
    /** Freeform instructions for this task. */
    instructions: string;
  };
  platform?: {
    id: string;
    name: string;
  };
  community?: {
    id: string;
    name: string;
    platform: string;
    rulesSummary?: string;
    cultureSummary?: string;
  };
  thread?: {
    url?: string;
    summary: string;
  };
  /** AI-consolidated lessons from prior interactions. */
  relevantMemories?: readonly string[];
  /** Recent activity markers — e.g. "last posted in r/X 2 days ago". */
  recentActivity?: readonly string[];
}

/**
 * Output of the composer. `systemPrompt` is cache-friendly (Soul prefix);
 * `userPrompt` carries the per-call task.
 */
export interface ComposedPrompt {
  systemPrompt: string;
  userPrompt: string;
}

/**
 * Full composer input. `product` is optional — some prompts (e.g. pure
 * community engagement during warm-up) don't mention the product at all.
 */
export interface ComposePromptInput {
  legend: Legend;
  product: Product | null;
  context: PromptContext;
}
