import { describe, expect, it } from 'vitest';
import { canTransition, IllegalTransitionError } from '../../src/tasks/transitions.js';

describe('task status transitions', () => {
  it('allows backlog → in_progress', () => {
    expect(canTransition('backlog', 'in_progress')).toBe(true);
  });

  it('rejects backlog → done', () => {
    expect(canTransition('backlog', 'done')).toBe(false);
  });

  it('allows self-transition (idempotent updates)', () => {
    expect(canTransition('in_progress', 'in_progress')).toBe(true);
  });

  it('allows in_review → in_progress (rework loop)', () => {
    expect(canTransition('in_review', 'in_progress')).toBe(true);
  });

  it('done is terminal', () => {
    expect(canTransition('done', 'backlog')).toBe(false);
    expect(canTransition('done', 'in_progress')).toBe(false);
    expect(canTransition('done', 'approved')).toBe(false);
  });

  it('approved can only go to done', () => {
    expect(canTransition('approved', 'done')).toBe(true);
    expect(canTransition('approved', 'in_progress')).toBe(false);
    expect(canTransition('approved', 'backlog')).toBe(false);
  });

  it('blocked can recover to backlog or in_progress', () => {
    expect(canTransition('blocked', 'backlog')).toBe(true);
    expect(canTransition('blocked', 'in_progress')).toBe(true);
    expect(canTransition('blocked', 'done')).toBe(false);
  });

  it('IllegalTransitionError carries from/to + name', () => {
    const err = new IllegalTransitionError('done', 'backlog');
    expect(err.from).toBe('done');
    expect(err.to).toBe('backlog');
    expect(err.name).toBe('IllegalTransitionError');
    expect(err.message).toContain('done');
    expect(err.message).toContain('backlog');
  });
});
