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

  // LLM providers (all optional — at least one must be set at runtime)
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  DEEPSEEK_API_KEY: z.string().optional(),
  QWEN_API_KEY: z.string().optional(),

  // LLM budget
  LLM_MONTHLY_BUDGET_CENTS: z.coerce.number().int().positive().default(2000),
  LLM_DEFAULT_MODE: z.enum(['primary', 'balanced', 'budget']).default('balanced'),

  // Keycloak
  KEYCLOAK_URL: z.string().url().default('http://localhost:9080'),
  KEYCLOAK_REALM: z.string().default('advocate'),
  KEYCLOAK_CLIENT_ID: z.string().default('advocate-app'),

  // Telegram (optional until bot is created)
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),

  // Security — must be a 64-character hex string (32 bytes)
  CREDENTIAL_MASTER_KEY: z
    .string()
    .length(64, 'CREDENTIAL_MASTER_KEY must be a 64-character hex string (32 bytes)')
    .regex(/^[0-9a-fA-F]+$/, 'CREDENTIAL_MASTER_KEY must be hex-encoded'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    cached = parseEnv(process.env);
  }
  return cached;
}
