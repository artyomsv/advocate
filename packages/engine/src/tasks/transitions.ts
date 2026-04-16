import type { TaskStatus } from './types.js';

/**
 * Allowed task status transitions. The kanban board consults this map before
 * every `updateStatus` call; illegal transitions throw with a readable error.
 *
 * - backlog       → in_progress, blocked
 * - in_progress   → in_review, blocked, backlog (revert)
 * - in_review     → approved, in_progress (rework), blocked
 * - approved      → done
 * - done          → (terminal)
 * - blocked       → backlog, in_progress
 */
export const TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> = {
  backlog: ['in_progress', 'blocked'],
  in_progress: ['in_review', 'blocked', 'backlog'],
  in_review: ['approved', 'in_progress', 'blocked'],
  approved: ['done'],
  done: [],
  blocked: ['backlog', 'in_progress'],
};

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true; // self-transition is a no-op, allowed
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(
    public readonly from: TaskStatus,
    public readonly to: TaskStatus,
  ) {
    super(`Illegal task transition: ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}
