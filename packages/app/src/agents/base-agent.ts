import type { LlmResponse } from '@advocate/engine';
import type { AgentDeps } from './types.js';

export interface LlmCall {
  taskType: string;
  systemPrompt: string;
  userPrompt: string;
  /** Force the router to treat this call as sensitive regardless of task type. */
  sensitive?: boolean;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Shared dependency container for every concrete agent. Subclasses add
 * methods that call the LLM router + persistence via `deps`.
 */
export abstract class BaseAgent {
  readonly deps: AgentDeps;
  abstract readonly name: string;

  constructor(deps: AgentDeps) {
    this.deps = deps;
  }

  /** Common LLM call shape — delegates to the router with agent-context logging. */
  protected async callLlm(call: LlmCall): Promise<LlmResponse> {
    this.deps.logger.debug({ agent: this.name, taskType: call.taskType }, 'agent issuing LLM call');
    return this.deps.router.generate(
      call.taskType,
      {
        systemPrompt: call.systemPrompt,
        userPrompt: call.userPrompt,
        temperature: call.temperature,
        maxTokens: call.maxTokens,
      },
      { sensitive: call.sensitive },
    );
  }
}
