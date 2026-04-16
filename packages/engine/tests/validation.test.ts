import { describe, expect, it } from 'vitest';
import { parseAgentDefinition, safeParseAgentDefinition } from '../src/core/validation.js';

const validDef = {
  id: '123e4567-e89b-42d3-a456-426614174000',
  name: 'Campaign Lead',
  role: 'leader',
  soul: 'You coordinate campaigns...',
  modelConfig: { taskType: 'strategy' },
  memoryConfig: {
    episodicEnabled: true,
    relationalEnabled: true,
    consolidationIntervalHours: 24,
    maxRecentEpisodes: 100,
  },
  permissions: ['create_task', 'escalate_to_human'],
};

describe('parseAgentDefinition', () => {
  it('accepts a valid definition', () => {
    const parsed = parseAgentDefinition(validDef);
    expect(parsed.id).toBe(validDef.id);
    expect(parsed.permissions).toHaveLength(2);
  });

  it('rejects a non-UUID id', () => {
    expect(() => parseAgentDefinition({ ...validDef, id: 'not-a-uuid' })).toThrow();
  });

  it('rejects an unknown permission', () => {
    expect(() =>
      parseAgentDefinition({ ...validDef, permissions: ['not_a_real_permission'] }),
    ).toThrow();
  });

  it('rejects an unknown LLM task type', () => {
    expect(() =>
      parseAgentDefinition({
        ...validDef,
        modelConfig: { taskType: 'bogus' },
      }),
    ).toThrow();
  });

  it('rejects empty soul', () => {
    expect(() => parseAgentDefinition({ ...validDef, soul: '' })).toThrow();
  });

  it('accepts a definition with optional parentId and metadata', () => {
    const parsed = parseAgentDefinition({
      ...validDef,
      parentId: '123e4567-e89b-42d3-a456-426614174001',
      metadata: { team: 'alpha' },
    });
    expect(parsed.parentId).toBeDefined();
    expect(parsed.metadata?.team).toBe('alpha');
  });

  it('safeParseAgentDefinition returns a structured error', () => {
    const result = safeParseAgentDefinition({ ...validDef, id: 'bogus' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});
