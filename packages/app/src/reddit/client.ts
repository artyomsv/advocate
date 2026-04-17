import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';
import type * as schema from '../db/schema.js';
import { type RedditAppConfig, refreshAccessToken } from './oauth.js';
import { RedditTokenStore } from './tokens.js';

const log = childLogger('reddit.client');

export interface SubmitRequest {
  subreddit: string;
  title: string;
  body: string;
}

export interface SubmitResult {
  id: string;
  url: string;
  postedAt: string;
}

export class RedditClient {
  constructor(
    private readonly cfg: RedditAppConfig,
    private readonly tokens: RedditTokenStore,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async ensureValidToken(legendAccountId: string): Promise<string> {
    const stored = await this.tokens.load(legendAccountId);
    if (!stored) {
      throw new Error(`No Reddit tokens for legend_account ${legendAccountId}`);
    }
    const now = Date.now();
    const exp = new Date(stored.expiresAt).getTime();
    if (exp - now > 60_000) return stored.accessToken;

    log.info({ legendAccountId }, 'refreshing reddit token');
    const refreshed = await refreshAccessToken(this.cfg, stored.refreshToken, this.fetchImpl);
    const expiresAt = new Date(now + refreshed.expires_in * 1000).toISOString();
    await this.tokens.save(legendAccountId, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? stored.refreshToken,
      scope: refreshed.scope,
      expiresAt,
    });
    return refreshed.access_token;
  }

  async submit(legendAccountId: string, request: SubmitRequest): Promise<SubmitResult> {
    const bearer = await this.ensureValidToken(legendAccountId);
    const params = new URLSearchParams({
      api_type: 'json',
      kind: 'self',
      sr: request.subreddit,
      title: request.title,
      text: request.body,
    });
    const res = await this.fetchImpl('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': this.cfg.userAgent,
      },
      body: params.toString(),
    });
    if (!res.ok) {
      throw new Error(`Reddit submit failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      json?: {
        errors?: unknown[];
        data?: { id?: string; name?: string; url?: string };
      };
    };
    const data = json.json?.data;
    if (!data?.name || !data.url) {
      throw new Error(`Reddit submit unexpected response: ${JSON.stringify(json)}`);
    }
    return { id: data.name, url: data.url, postedAt: new Date().toISOString() };
  }
}

export function buildRedditClient(
  cfg: RedditAppConfig,
  db: NodePgDatabase<typeof schema>,
  fetchImpl: typeof fetch = fetch,
): RedditClient {
  return new RedditClient(
    cfg,
    new RedditTokenStore(db, getEnv().CREDENTIAL_MASTER_KEY),
    fetchImpl,
  );
}
