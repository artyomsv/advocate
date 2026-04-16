import { z } from 'zod';
import { UUID_V4_PATTERN } from '../types/ids.js';
import { KNOWN_PERMISSIONS } from '../types/permissions.js';

/**
 * Zod schemas mirroring the core TypeScript types. Used at trust boundaries —
 * when an AgentDefinition arrives from an external source (DB row, API
 * payload, config file) we parse it through these before trusting its shape.
 */

const uuidV4Schema = z.string().regex(UUID_V4_PATTERN, 'must be a UUID v4');

const llmTaskTypeSchema = z.enum(['content_writing', 'strategy', 'classification', 'bulk']);

export const modelConfigSchema = z.object({
  taskType: llmTaskTypeSchema,
  temperatureOverride: z.number().min(0).max(2).optional(),
  maxTokensOverride: z.number().int().positive().optional(),
  allowBudgetTier: z.boolean().optional(),
});

export const memoryConfigSchema = z.object({
  episodicEnabled: z.boolean(),
  relationalEnabled: z.boolean(),
  consolidationIntervalHours: z.number().int().nonnegative(),
  maxRecentEpisodes: z.number().int().nonnegative(),
});

const permissionSchema = z.enum([
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

export const agentDefinitionSchema = z.object({
  id: uuidV4Schema,
  name: z.string().min(1).max(200),
  role: z.string().min(1).max(100),
  soul: z.string().min(1),
  modelConfig: modelConfigSchema,
  memoryConfig: memoryConfigSchema,
  permissions: z.array(permissionSchema).readonly(),
  parentId: uuidV4Schema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Parse an unknown input into a validated AgentDefinition shape.
 * Throws a ZodError with a readable path if validation fails.
 */
export function parseAgentDefinition(input: unknown) {
  return agentDefinitionSchema.parse(input);
}

/**
 * Non-throwing variant — returns the Zod SafeParseResult.
 */
export function safeParseAgentDefinition(input: unknown) {
  return agentDefinitionSchema.safeParse(input);
}

// Runtime cross-check: the schema's permission enum MUST stay in sync with
// the TypeScript AgentPermission union + KNOWN_PERMISSIONS set.
{
  const schemaPerms = new Set(permissionSchema.options);
  for (const p of KNOWN_PERMISSIONS) {
    if (!schemaPerms.has(p)) {
      throw new Error(
        `AgentPermission "${p}" exists in KNOWN_PERMISSIONS but not in the Zod schema. ` +
          `Keep engine/src/core/validation.ts and engine/src/types/permissions.ts in sync.`,
      );
    }
  }
  if (schemaPerms.size !== KNOWN_PERMISSIONS.size) {
    throw new Error(
      'AgentPermission count mismatch between Zod schema and KNOWN_PERMISSIONS. ' +
        `Schema has ${schemaPerms.size}, KNOWN_PERMISSIONS has ${KNOWN_PERMISSIONS.size}.`,
    );
  }
}
