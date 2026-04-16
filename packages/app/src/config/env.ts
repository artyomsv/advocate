import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Ports
  API_PORT: z.coerce.number().int().positive().default(36401),
  DASHBOARD_PORT: z.coerce.number().int().positive().default(36400),
  POSTGRES_PORT: z.coerce.number().int().positive().default(36432),
  REDIS_PORT: z.coerce.number().int().positive().default(36479),
  BULL_BOARD_PORT: z.coerce.number().int().positive().default(36473),

  // Connections
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  // LLM providers (all optional — at least one must be set at runtime).
  // Empty strings are normalized to undefined in parseEnv before validation.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  GOOGLE_AI_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  QWEN_API_KEY: z.string().min(1).optional(),

  // LLM budget
  LLM_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(2000),
  LLM_DEFAULT_MODE: z.enum(['primary', 'balanced', 'budget']).default('balanced'),

  // Keycloak
  KEYCLOAK_URL: z.string().url().default('http://localhost:9080'),
  KEYCLOAK_REALM: z.string().default('mynah'),
  KEYCLOAK_CLIENT_ID: z.string().default('mynah-dashboard'),

  // Telegram (optional until bot is created). Empty strings normalized to undefined in parseEnv.
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHANNEL_ID: z.string().min(1).optional(),

  // Security — must be a 64-character hex string (32 bytes)
  CREDENTIAL_MASTER_KEY: z
    .string()
    .length(64, 'CREDENTIAL_MASTER_KEY must be a 64-character hex string (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'CREDENTIAL_MASTER_KEY must be hex-encoded'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Dev-only: short-circuit all auth to a synthetic ROLE_ADMIN user.
  // Refused at parse time when NODE_ENV=production.
  AUTH_DEV_BYPASS: z
    .string()
    .transform((v) => v === 'true' || v === '1')
    .default('false'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Convert empty strings to undefined for optional fields
  const normalized = Object.fromEntries(
    Object.entries(source).map(([key, val]) => [key, val === '' ? undefined : val]),
  );
  const parsed = envSchema.parse(normalized);
  if (parsed.NODE_ENV === 'production' && parsed.AUTH_DEV_BYPASS) {
    throw new Error('AUTH_DEV_BYPASS=true is not permitted when NODE_ENV=production');
  }
  return parsed;
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}

/**
 * Test-only: drop the memoised env so the next getEnv() re-parses
 * process.env. Do NOT call in production code.
 */
export function resetEnvForTest(): void {
  cached = undefined;
}
