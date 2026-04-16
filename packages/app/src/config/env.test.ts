import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  const validEnv = {
    NODE_ENV: 'development',
    API_PORT: '36401',
    DATABASE_URL: 'postgresql://advocate:advocate@localhost:36432/advocate',
    REDIS_URL: 'redis://localhost:36479',
    CREDENTIAL_MASTER_KEY: 'a'.repeat(64),
    LLM_MONTHLY_BUDGET_CENTS: '2000',
    LLM_DEFAULT_MODE: 'balanced',
    KEYCLOAK_URL: 'http://localhost:9080',
    KEYCLOAK_REALM: 'advocate',
    KEYCLOAK_CLIENT_ID: 'advocate-app',
    LOG_LEVEL: 'info',
  };

  it('parses a valid environment', () => {
    const env = parseEnv(validEnv);
    expect(env.API_PORT).toBe(36401);
    expect(env.LLM_MONTHLY_BUDGET_CENTS).toBe(2000);
  });

  it('rejects missing CREDENTIAL_MASTER_KEY', () => {
    const rest: Record<string, string | undefined> = { ...validEnv };
    delete rest.CREDENTIAL_MASTER_KEY;
    expect(() => parseEnv(rest)).toThrow();
  });

  it('rejects CREDENTIAL_MASTER_KEY of wrong length', () => {
    expect(() => parseEnv({ ...validEnv, CREDENTIAL_MASTER_KEY: 'short' })).toThrow();
  });

  it('rejects invalid LLM_DEFAULT_MODE', () => {
    expect(() => parseEnv({ ...validEnv, LLM_DEFAULT_MODE: 'bogus' })).toThrow();
  });

  it('defaults API_PORT when not provided', () => {
    const rest: Record<string, string | undefined> = { ...validEnv };
    delete rest.API_PORT;
    const env = parseEnv(rest);
    expect(env.API_PORT).toBe(36401);
  });
});
