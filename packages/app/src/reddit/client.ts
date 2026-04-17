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
  /** Self-post text body. Ignored when `url` is set (link post). */
  body: string;
  /**
   * If set, submit as a link/image post instead of a self-post. Reddit
   * classifies image URLs by extension — .jpg/.png/.gif URLs become image
   * posts, others become link posts.
   */
  url?: string;
  /** Flair template id (link_flair_template_id) — optional. */
  flairId?: string;
  /** Flair text override — Reddit shows this if the subreddit allows. */
  flairText?: string;
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
  /** Reddit marks removed posts via multiple fields; this is a rollup. */
  isRemoved: boolean;
  /** e.g. "moderator", "author", "reddit", "automod_filtered" */
  removedByCategory: string | null;
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
  removed?: boolean;
  removed_by_category?: string | null;
  banned_by?: string | null;
}

function parseThread(raw: RawRedditThread): RedditThread {
  const author = raw.author ?? '';
  const body = raw.selftext ?? '';
  // Reddit signals removal via several shapes:
  //  - removed_by_category = 'moderator' | 'automod_filtered' | 'copyright_takedown' ...
  //  - banned_by truthy (legacy)
  //  - author == '[deleted]' and selftext == '[removed]'
  const isRemoved =
    raw.removed === true ||
    (raw.removed_by_category != null && raw.removed_by_category !== '') ||
    (raw.banned_by != null && raw.banned_by !== '') ||
    (author === '[deleted]' && body === '[removed]');
  const removedByCategory = raw.removed_by_category ?? raw.banned_by ?? null;

  return {
    id: raw.id ?? '',
    fullname: raw.name ?? '',
    title: raw.title ?? '',
    body,
    url: raw.url ?? '',
    permalink: raw.permalink ? `https://www.reddit.com${raw.permalink}` : '',
    subreddit: raw.subreddit ?? '',
    author,
    score: raw.score ?? 0,
    numComments: raw.num_comments ?? 0,
    createdUtc: raw.created_utc ?? 0,
    isSelfPost: raw.is_self ?? false,
    stickied: raw.stickied ?? false,
    over18: raw.over_18 ?? false,
    promoted: raw.promoted ?? false,
    isRemoved,
    removedByCategory,
  };
}

export class RedditClient {
  constructor(
    private readonly cfg: RedditAppConfig,
    private readonly tokens: RedditTokenStore,
    private readonly rawFetch: typeof fetch = fetch,
  ) {}

  /**
   * Wrapped fetch with:
   *   1. preflight sleep when the previous response told us we're nearly out
   *   2. retry-with-backoff on 429 + 5xx, reading X-Ratelimit-Reset or
   *      Retry-After headers to size the wait
   *   3. parses X-Ratelimit-Remaining after each call to feed (1) on the next
   *
   * Reddit documents these headers on every /oauth response.
   */
  private rateLimitRemaining = Number.POSITIVE_INFINITY;
  private rateLimitResetAt = 0;

  private async waitIfThrottled(): Promise<void> {
    // Only slow down when they've told us we have very few calls left; under
    // ~5 remaining we pause until the window resets.
    if (this.rateLimitRemaining > 5) return;
    const wait = Math.max(0, this.rateLimitResetAt - Date.now());
    if (wait <= 0) return;
    log.warn({ remaining: this.rateLimitRemaining, waitMs: wait }, 'reddit rate-limit pause');
    await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
  }

  private updateRateLimitFromResponse(res: Response): void {
    // Unit-test mocks often return plain objects without a headers API; be
    // defensive here — treat missing headers as "no info", not a failure.
    const headerGet = res.headers?.get?.bind(res.headers);
    if (!headerGet) return;
    const remaining = Number(headerGet('x-ratelimit-remaining'));
    const resetSeconds = Number(headerGet('x-ratelimit-reset'));
    if (Number.isFinite(remaining)) this.rateLimitRemaining = remaining;
    if (Number.isFinite(resetSeconds) && resetSeconds > 0) {
      this.rateLimitResetAt = Date.now() + resetSeconds * 1000;
    }
  }

  private fetchImpl: typeof fetch = async (input, init) => {
    const maxAttempts = 3;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.waitIfThrottled();
      const res = await this.rawFetch(input, init);
      this.updateRateLimitFromResponse(res);
      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        const headerGet = res.headers?.get?.bind(res.headers);
        const retryAfter = Number(headerGet?.('retry-after'));
        const resetSec = Number(headerGet?.('x-ratelimit-reset'));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Number.isFinite(resetSec) && resetSec > 0
            ? resetSec * 1000
            : 2 ** attempt * 500; // 1s, 2s, 4s
        log.warn(
          { status: res.status, attempt, backoffMs: backoff },
          'reddit transient error, backing off',
        );
        await new Promise((r) => setTimeout(r, Math.min(backoff, 30_000)));
        lastErr = new Error(`reddit ${res.status}`);
        continue;
      }
      return res;
    }
    throw lastErr ?? new Error('reddit fetch failed after retries');
  };

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

    // Choose kind based on the request — image URLs route to kind=image so
    // Reddit displays the preview inline; all other urls become link posts.
    const isImageUrl =
      typeof request.url === 'string' && /\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(request.url);
    const kind = request.url ? (isImageUrl ? 'image' : 'link') : 'self';

    const params = new URLSearchParams({
      api_type: 'json',
      kind,
      sr: request.subreddit,
      title: request.title,
    });
    if (kind === 'self') {
      params.set('text', request.body);
    } else if (request.url) {
      params.set('url', request.url);
    }
    if (request.flairId) params.set('flair_id', request.flairId);
    if (request.flairText) params.set('flair_text', request.flairText);

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
