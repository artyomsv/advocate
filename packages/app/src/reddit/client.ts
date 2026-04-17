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

export interface RedditThread {
  id: string;
  fullname: string;
  title: string;
  body: string;
  url: string;
  permalink: string;
  subreddit: string;
  author: string;
  score: number;
  numComments: number;
  createdUtc: number;
  isSelfPost: boolean;
  stickied: boolean;
  over18: boolean;
  promoted: boolean;
}

interface RawRedditThread {
  id?: string;
  name?: string;
  title?: string;
  selftext?: string;
  url?: string;
  permalink?: string;
  subreddit?: string;
  author?: string;
  score?: number;
  num_comments?: number;
  created_utc?: number;
  is_self?: boolean;
  stickied?: boolean;
  over_18?: boolean;
  promoted?: boolean;
}

function parseThread(raw: RawRedditThread): RedditThread {
  return {
    id: raw.id ?? '',
    fullname: raw.name ?? '',
    title: raw.title ?? '',
    body: raw.selftext ?? '',
    url: raw.url ?? '',
    permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : '',
    subreddit: raw.subreddit ?? '',
    author: raw.author ?? '',
    score: raw.score ?? 0,
    numComments: raw.num_comments ?? 0,
    createdUtc: raw.created_utc ?? 0,
    isSelfPost: raw.is_self ?? false,
    stickied: raw.stickied ?? false,
    over18: raw.over_18 ?? false,
    promoted: raw.promoted ?? false,
  };
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

  async fetchListing(
    legendAccountId: string,
    subreddit: string,
    sort: 'hot' | 'new' | 'top' = 'hot',
    limit = 25,
  ): Promise<RedditThread[]> {
    const bearer = await this.ensureValidToken(legendAccountId);
    const url = `https://oauth.reddit.com/r/${encodeURIComponent(subreddit)}/${sort}?limit=${limit}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'User-Agent': this.cfg.userAgent,
      },
    });
    if (!res.ok) {
      throw new Error(`Reddit listing failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { children?: Array<{ kind: string; data: RawRedditThread }> };
    };
    const rows = json.data?.children ?? [];
    return rows
      .filter((r) => r.kind === 't3')
      .map((r) => parseThread(r.data))
      .filter((t) => !t.stickied && !t.over18 && !t.promoted);
  }

  /**
   * Batch-fetch thing metadata via /api/info. Accepts up to 100 fullnames
   * (t3_xxx) at a time. Reddit returns empty data for removed or deleted
   * posts; we return only the threads that came back.
   */
  async fetchThings(
    legendAccountId: string,
    fullnames: readonly string[],
  ): Promise<RedditThread[]> {
    if (fullnames.length === 0) return [];
    const bearer = await this.ensureValidToken(legendAccountId);
    const url = `https://oauth.reddit.com/api/info?id=${encodeURIComponent(fullnames.join(','))}`;
    const res = await this.fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${bearer}`,
        'User-Agent': this.cfg.userAgent,
      },
    });
    if (!res.ok) {
      throw new Error(`Reddit info failed: ${res.status}`);
    }
    const json = (await res.json()) as {
      data?: { children?: Array<{ kind: string; data: RawRedditThread }> };
    };
    return (json.data?.children ?? [])
      .filter((r) => r.kind === 't3')
      .map((r) => parseThread(r.data));
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
