import type { AgentId } from '../types/ids.js';
import type { AgentDefinition } from './agent.js';
import { parseAgentDefinition } from './validation.js';

/**
 * In-memory index of registered agents. The Runtime owns one of these and
 * uses it for lookup + hierarchy traversal. Persistence to the `agents`
 * table is layered on top via Plan 07's StorageProvider.
 *
 * All mutating methods validate the input through the Zod schema — callers
 * with trusted input (already-parsed definitions) can use `registerRaw`
 * to skip re-parsing.
 */
export class AgentRegistry {
  readonly #byId = new Map<AgentId, AgentDefinition>();
  readonly #byRole = new Map<string, Set<AgentId>>();

  /** Register a definition after validating it. Duplicate IDs are rejected. */
  register(definition: unknown): AgentDefinition {
    const parsed = parseAgentDefinition(definition) as AgentDefinition;
    return this.registerRaw(parsed);
  }

  /** Register a pre-validated definition. Duplicate IDs are rejected. */
  registerRaw(definition: AgentDefinition): AgentDefinition {
    if (this.#byId.has(definition.id)) {
      throw new Error(`Agent ${definition.id} already registered`);
    }
    this.#byId.set(definition.id, definition);

    let byRole = this.#byRole.get(definition.role);
    if (!byRole) {
      byRole = new Set();
      this.#byRole.set(definition.role, byRole);
    }
    byRole.add(definition.id);

    return definition;
  }

  /** Remove an agent. Returns whether it was present. */
  unregister(agentId: AgentId): boolean {
    const def = this.#byId.get(agentId);
    if (!def) return false;
    this.#byId.delete(agentId);
    this.#byRole.get(def.role)?.delete(agentId);
    return true;
  }

  get(agentId: AgentId): AgentDefinition | undefined {
    return this.#byId.get(agentId);
  }

  has(agentId: AgentId): boolean {
    return this.#byId.has(agentId);
  }

  /** All registered agents. Iteration order is registration order. */
  list(): readonly AgentDefinition[] {
    return Array.from(this.#byId.values());
  }

  /** Agents with a given role. */
  byRole(role: string): readonly AgentDefinition[] {
    const ids = this.#byRole.get(role);
    if (!ids) return [];
    const defs: AgentDefinition[] = [];
    for (const id of ids) {
      const def = this.#byId.get(id);
      if (def) defs.push(def);
    }
    return defs;
  }

  /** Direct children of an agent (one level of the hierarchy). */
  children(parentId: AgentId): readonly AgentDefinition[] {
    const out: AgentDefinition[] = [];
    for (const def of this.#byId.values()) {
      if (def.parentId === parentId) out.push(def);
    }
    return out;
  }

  /** Ancestors of an agent (root-last). */
  ancestors(agentId: AgentId): readonly AgentDefinition[] {
    const out: AgentDefinition[] = [];
    let current = this.#byId.get(agentId);
    while (current?.parentId) {
      const parent = this.#byId.get(current.parentId);
      if (!parent) break;
      out.push(parent);
      current = parent;
    }
    return out;
  }

  clear(): void {
    this.#byId.clear();
    this.#byRole.clear();
  }

  get size(): number {
    return this.#byId.size;
  }
}
