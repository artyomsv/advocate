import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getEnv } from '../config/env.js';
import { decrypt, encrypt } from '../credentials/cipher.js';
import type * as schema from '../db/schema.js';
import { platformSecrets } from '../db/schema.js';
import { SECRET_CATEGORIES, type SecretCategory, isKnownKey } from './categories.js';

export interface MaskedSecret {
  category: SecretCategory;
  key: string;
  masked: string;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

function mask(value: string): string {
  if (value.length <= 4) return '••••';
  return `••••••••${value.slice(-2)}`;
}

export class SecretsService {
  constructor(private readonly db: NodePgDatabase<typeof schema>) {}

  async resolve(category: SecretCategory, key: string): Promise<string | null> {
    const [row] = await this.db
      .select()
      .from(platformSecrets)
      .where(and(eq(platformSecrets.category, category), eq(platformSecrets.key, key)))
      .limit(1);
    if (row) {
      return decrypt(row.encryptedPayload, getEnv().CREDENTIAL_MASTER_KEY);
    }
    const envValue = process.env[key];
    return envValue && envValue.length > 0 ? envValue : null;
  }

  async list(category: SecretCategory): Promise<MaskedSecret[]> {
    const knownKeys = SECRET_CATEGORIES[category] as readonly string[];
    const rows = await this.db
      .select()
      .from(platformSecrets)
      .where(eq(platformSecrets.category, category));
    const byKey = new Map(rows.map((r) => [r.key, r]));

    return knownKeys.map<MaskedSecret>((key) => {
      const dbRow = byKey.get(key);
      if (dbRow) {
        const plain = decrypt(dbRow.encryptedPayload, getEnv().CREDENTIAL_MASTER_KEY);
        return {
          category,
          key,
          masked: mask(plain),
          source: 'db',
          updatedAt: dbRow.updatedAt.toISOString(),
        };
      }
      const envValue = process.env[key];
      if (envValue && envValue.length > 0) {
        return {
          category,
          key,
          masked: mask(envValue),
          source: 'env',
          updatedAt: null,
        };
      }
      return { category, key, masked: '', source: 'unset', updatedAt: null };
    });
  }

  async set(category: SecretCategory, key: string, plaintext: string): Promise<void> {
    if (!isKnownKey(category, key)) {
      throw new Error(`Unknown secret key ${key} in ${category}`);
    }
    const encryptedPayload = encrypt(plaintext, getEnv().CREDENTIAL_MASTER_KEY);
    await this.db
      .insert(platformSecrets)
      .values({ category, key, encryptedPayload })
      .onConflictDoUpdate({
        target: [platformSecrets.category, platformSecrets.key],
        set: { encryptedPayload, updatedAt: new Date() },
      });
  }

  async delete(category: SecretCategory, key: string): Promise<void> {
    await this.db
      .delete(platformSecrets)
      .where(and(eq(platformSecrets.category, category), eq(platformSecrets.key, key)));
  }
}
