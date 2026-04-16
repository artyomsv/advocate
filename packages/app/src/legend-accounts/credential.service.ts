import { and, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { childLogger } from '../config/logger.js';
import { decrypt, encrypt } from '../credentials/cipher.js';
import { type LegendCredential, legendCredentials } from '../db/schema/app/legends.js';
import type * as schema from '../db/schema.js';
import { CredentialNotFoundError } from './errors.js';

const log = childLogger('credentials');

export interface LegendCredentialSummary {
  id: string;
  legendAccountId: string;
  type: string;
  metadata: Record<string, unknown> | null;
  revoked: boolean;
  createdAt: Date;
  rotatedAt: Date | null;
}

export interface StoreCredentialInput {
  legendAccountId: string;
  type: string;
  plaintext: string;
  metadata?: Record<string, unknown>;
}

export class LegendCredentialService {
  constructor(
    private readonly db: NodePgDatabase<typeof schema>,
    private readonly masterKey: string,
  ) {}

  async store(input: StoreCredentialInput): Promise<LegendCredential> {
    const encryptedPayload = encrypt(input.plaintext, this.masterKey);
    const [row] = await this.db
      .insert(legendCredentials)
      .values({
        legendAccountId: input.legendAccountId,
        type: input.type,
        encryptedPayload,
        metadata: input.metadata,
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    log.info({ credentialId: row.id, type: row.type }, 'credential stored');
    return row;
  }

  async listForAccount(legendAccountId: string): Promise<readonly LegendCredentialSummary[]> {
    const rows = await this.db
      .select({
        id: legendCredentials.id,
        legendAccountId: legendCredentials.legendAccountId,
        type: legendCredentials.type,
        metadata: legendCredentials.metadata,
        revoked: legendCredentials.revoked,
        createdAt: legendCredentials.createdAt,
        rotatedAt: legendCredentials.rotatedAt,
      })
      .from(legendCredentials)
      .where(eq(legendCredentials.legendAccountId, legendAccountId));
    return rows as LegendCredentialSummary[];
  }

  async reveal(credentialId: string): Promise<string> {
    const [row] = await this.db
      .select()
      .from(legendCredentials)
      .where(eq(legendCredentials.id, credentialId))
      .limit(1);
    if (!row) throw new CredentialNotFoundError(credentialId);
    log.warn({ credentialId: row.id, type: row.type }, 'credential revealed');
    return decrypt(row.encryptedPayload, this.masterKey);
  }

  async rotate(credentialId: string, newPlaintext: string): Promise<LegendCredential> {
    const [existing] = await this.db
      .select()
      .from(legendCredentials)
      .where(eq(legendCredentials.id, credentialId))
      .limit(1);
    if (!existing) throw new CredentialNotFoundError(credentialId);

    const encryptedPayload = encrypt(newPlaintext, this.masterKey);

    await this.db
      .update(legendCredentials)
      .set({ revoked: true, rotatedAt: new Date() })
      .where(eq(legendCredentials.id, credentialId));

    const [created] = await this.db
      .insert(legendCredentials)
      .values({
        legendAccountId: existing.legendAccountId,
        type: existing.type,
        encryptedPayload,
        metadata: existing.metadata,
      })
      .returning();
    if (!created) throw new Error('insert returned no row');
    log.info({ oldId: credentialId, newId: created.id }, 'credential rotated');
    return created;
  }

  async revoke(credentialId: string): Promise<void> {
    const result = await this.db
      .update(legendCredentials)
      .set({ revoked: true })
      .where(and(eq(legendCredentials.id, credentialId), eq(legendCredentials.revoked, false)))
      .returning({ id: legendCredentials.id });
    if (result.length === 0) {
      throw new CredentialNotFoundError(credentialId);
    }
    log.info({ credentialId }, 'credential revoked');
  }
}
