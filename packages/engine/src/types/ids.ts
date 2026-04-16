import type { Brand } from './common.js';

/**
 * Branded ID types. All IDs are UUID v4 strings at runtime; the brand is
 * purely for type-safety so a TaskId cannot be accidentally used where an
 * AgentId is expected.
 */
export type AgentId = Brand<string, 'AgentId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type MessageId = Brand<string, 'MessageId'>;
export type MemoryId = Brand<string, 'MemoryId'>;
export type ProjectId = Brand<string, 'ProjectId'>;

/**
 * UUID v4 regex. Exported so Zod schemas and runtime guards share one definition.
 */
export const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuidV4(value: string): boolean {
  return UUID_V4_PATTERN.test(value);
}

/**
 * Narrowing helpers. Throw if the input is not a valid UUID v4.
 */
export function asAgentId(value: string): AgentId {
  if (!isUuidV4(value)) {
    throw new Error(`Invalid AgentId: ${value}`);
  }
  return value as AgentId;
}

export function asTaskId(value: string): TaskId {
  if (!isUuidV4(value)) {
    throw new Error(`Invalid TaskId: ${value}`);
  }
  return value as TaskId;
}

export function asMessageId(value: string): MessageId {
  if (!isUuidV4(value)) {
    throw new Error(`Invalid MessageId: ${value}`);
  }
  return value as MessageId;
}

export function asMemoryId(value: string): MemoryId {
  if (!isUuidV4(value)) {
    throw new Error(`Invalid MemoryId: ${value}`);
  }
  return value as MemoryId;
}

export function asProjectId(value: string): ProjectId {
  if (!isUuidV4(value)) {
    throw new Error(`Invalid ProjectId: ${value}`);
  }
  return value as ProjectId;
}
