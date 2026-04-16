import { beforeEach, describe, expect, it } from 'vitest';
import type { AgentDefinition } from '../src/core/agent.js';
import { AgentRegistry } from '../src/core/registry.js';
import type { AgentId } from '../src/types/ids.js';

function makeDef(overrides: Partial<AgentDefinition> = {}): AgentDefinition {
  return {
    id: '11111111-2222-4333-8444-555555555555' as AgentId,
    name: 'Test Agent',
    role: 'leader',
    soul: 'Do the thing.',
    modelConfig: { taskType: 'strategy' },
    memoryConfig: {
      episodicEnabled: false,
      relationalEnabled: false,
      consolidationIntervalHours: 0,
      maxRecentEpisodes: 0,
    },
    permissions: [],
    ...overrides,
  };
}

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  it('registers a valid definition', () => {
    const def = makeDef();
    registry.register(def);
    expect(registry.size).toBe(1);
    expect(registry.get(def.id)).toEqual(def);
    expect(registry.has(def.id)).toBe(true);
  });

  it('rejects duplicate IDs', () => {
    registry.register(makeDef());
    expect(() => registry.register(makeDef())).toThrow(/already registered/);
  });

  it('rejects invalid definitions via Zod', () => {
    expect(() => registry.register({ ...makeDef(), id: 'not-a-uuid' })).toThrow();
  });

  it('unregister removes and returns true; repeated returns false', () => {
    const def = makeDef();
    registry.register(def);
    expect(registry.unregister(def.id)).toBe(true);
    expect(registry.has(def.id)).toBe(false);
    expect(registry.unregister(def.id)).toBe(false);
  });

  it('indexes agents by role', () => {
    const leaderA = makeDef({ id: '11111111-1111-4111-8111-111111111111' as AgentId });
    const leaderB = makeDef({ id: '22222222-2222-4222-8222-222222222222' as AgentId });
    const scout = makeDef({
      id: '33333333-3333-4333-8333-333333333333' as AgentId,
      role: 'scout',
    });
    registry.registerRaw(leaderA);
    registry.registerRaw(leaderB);
    registry.registerRaw(scout);

    expect(registry.byRole('leader')).toHaveLength(2);
    expect(registry.byRole('scout')).toHaveLength(1);
    expect(registry.byRole('nonexistent')).toHaveLength(0);
  });

  it('traces the parent/child hierarchy', () => {
    const parentId = '11111111-1111-4111-8111-111111111111' as AgentId;
    const childId = '22222222-2222-4222-8222-222222222222' as AgentId;
    const grandchildId = '33333333-3333-4333-8333-333333333333' as AgentId;

    registry.registerRaw(makeDef({ id: parentId }));
    registry.registerRaw(makeDef({ id: childId, parentId }));
    registry.registerRaw(makeDef({ id: grandchildId, parentId: childId }));

    expect(registry.children(parentId)).toHaveLength(1);
    expect(registry.children(parentId)[0]?.id).toBe(childId);

    const ancestors = registry.ancestors(grandchildId);
    expect(ancestors.map((a) => a.id)).toEqual([childId, parentId]);
  });

  it('list() returns all in registration order', () => {
    const a = makeDef({ id: '11111111-1111-4111-8111-111111111111' as AgentId });
    const b = makeDef({ id: '22222222-2222-4222-8222-222222222222' as AgentId });
    registry.registerRaw(a);
    registry.registerRaw(b);
    expect(registry.list().map((d) => d.id)).toEqual([a.id, b.id]);
  });

  it('clear() empties the registry', () => {
    registry.register(makeDef());
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('unregister removes the role index entry', () => {
    const def = makeDef();
    registry.registerRaw(def);
    registry.unregister(def.id);
    expect(registry.byRole('leader')).toHaveLength(0);
  });
});
