/**
 * Capabilities an agent may be granted. The engine doesn't enforce these
 * directly — it surfaces them to the runtime, which enforces them at the
 * call site.
 */
export type AgentPermission =
  | 'create_task'
  | 'assign_task'
  | 'approve_content'
  | 'escalate_to_human'
  | 'modify_strategy'
  | 'post_content'
  | 'access_credentials'
  | 'schedule_heartbeat'
  | 'write_memory'
  | 'send_message';

/**
 * Validates a value is a known permission. Use at module boundaries where
 * permissions come from JSON (DB rows, API payloads).
 */
export const KNOWN_PERMISSIONS = new Set<AgentPermission>([
  'create_task',
  'assign_task',
  'approve_content',
  'escalate_to_human',
  'modify_strategy',
  'post_content',
  'access_credentials',
  'schedule_heartbeat',
  'write_memory',
  'send_message',
]);

export function isAgentPermission(value: string): value is AgentPermission {
  return KNOWN_PERMISSIONS.has(value as AgentPermission);
}
