import { buildContextBlock } from './context-builder.js';
import { filterProductKnowledge } from './product-knowledge-filter.js';
import { buildSoulPrompt } from './soul-builder.js';
import type { ComposedPrompt, ComposePromptInput } from './types.js';

const SEPARATOR = '\n\n---\n\n';

export function composePrompt(input: ComposePromptInput): ComposedPrompt {
  const systemParts = [
    buildSoulPrompt(input.legend),
    input.product ? filterProductKnowledge(input.product, input.legend) : null,
    buildContextBlock(input.context),
  ].filter((part): part is string => part !== null && part.length > 0);

  return {
    systemPrompt: systemParts.join(SEPARATOR),
    userPrompt: input.context.task.instructions,
  };
}
