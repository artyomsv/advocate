import type { LLMRouter } from '@mynah/engine';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type pino from 'pino';
import type * as schema from '../db/schema.js';
import type { PromptContext } from '../prompts/types.js';

/**
 * Shared runtime dependencies available to every agent. Concrete agents
 * may depend on a subset.
 */
export interface AgentDeps {
  router: LLMRouter;
  db: NodePgDatabase<typeof schema>;
  logger: pino.Logger;
}

/**
 * Input for generating a draft. `productId` is optional — pure community
 * engagement doesn't involve a product mention.
 */
export interface DraftRequest {
  legendId: string;
  productId?: string;
  communityId?: string;
  task: PromptContext['task'];
  platform?: PromptContext['platform'];
  community?: PromptContext['community'];
  thread?: PromptContext['thread'];
  relevantMemories?: readonly string[];
  recentActivity?: readonly string[];
}

/**
 * Output from the ContentWriter. Includes the raw LLM metadata so the
 * dashboard / cost center can show what actually ran.
 */
export interface DraftResponse {
  content: string;
  /** The system prompt we sent — useful for debugging + dashboard preview. */
  systemPrompt: string;
  /** The user prompt we sent — same. */
  userPrompt: string;
  llm: {
    providerId: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    costMillicents: number;
    latencyMs: number;
  };
}
