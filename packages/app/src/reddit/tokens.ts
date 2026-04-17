import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type * as schema from '../db/schema.js';
import { LegendCredentialService } from '../legend-accounts/credential.service.js';

export interface RedditTokens {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expiresAt: string;
}

const CRED_TYPE = 'reddit-oauth';

export class RedditTokenStore {
  readonly #creds: LegendCredentialService;

  constructor(db: NodePgDatabase<typeof schema>, masterKey: string) {
    this.#creds = new LegendCredentialService(db, masterKey);
  }

  async save(legendAccountId: string, tokens: RedditTokens): Promise<void> {
    const existing = await this.#creds.listForAccount(legendAccountId);
    const current = existing.find((c) => c.type === CRED_TYPE && !c.revoked);
    if (current) {
      await this.#creds.rotate(current.id, JSON.stringify(tokens));
    } else {
      await this.#creds.store({
        legendAccountId,
        type: CRED_TYPE,
        plaintext: JSON.stringify(tokens),
      });
    }
  }

  async load(legendAccountId: string): Promise<RedditTokens | null> {
    const list = await this.#creds.listForAccount(legendAccountId);
    const row = list.find((c) => c.type === CRED_TYPE && !c.revoked);
    if (!row) return null;
    const plaintext = await this.#creds.reveal(row.id);
    return JSON.parse(plaintext) as RedditTokens;
  }
}
