import { ContentWriter } from './content-writer.js';
import type { AgentDeps } from './types.js';

export function createContentWriter(deps: AgentDeps): ContentWriter {
  return new ContentWriter(deps);
}
