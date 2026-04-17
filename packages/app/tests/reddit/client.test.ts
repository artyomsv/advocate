import { describe, expect, it, vi } from 'vitest';
import type { RedditAppConfig } from '../../src/reddit/oauth.js';
import { RedditClient } from '../../src/reddit/client.js';
import type { RedditTokenStore, RedditTokens } from '../../src/reddit/tokens.js';

const CFG: RedditAppConfig = {
  clientId: 'cid',
  clientSecret: 'csec',
  redirectUri: 'http://localhost:36401/oauth/reddit/callback',
  userAgent: 'mynah-test',
};

function makeTokenStore(initial: RedditTokens | null): RedditTokenStore {
  let state = initial;
  return {
    save: async (_id: string, tokens: RedditTokens) => {
      state = tokens;
    },
    load: async () => state,
  } as unknown as RedditTokenStore;
}

describe('RedditClient.ensureValidToken', () => {
  it('returns stored token when not near expiry', async () => {
    const tokens: RedditTokens = {
      accessToken: 'still-valid',
      refreshToken: 'rt',
      scope: 'identity',
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    };
    const store = makeTokenStore(tokens);
    const fetchMock = vi.fn();
    const client = new RedditClient(CFG, store, fetchMock as unknown as typeof fetch);
    const t = await client.ensureValidToken('acc-1');
    expect(t).toBe('still-valid');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refreshes when expiry < 60s away', async () => {
    const tokens: RedditTokens = {
      accessToken: 'expiring',
      refreshToken: 'rt-old',
      scope: 'identity',
      expiresAt: new Date(Date.now() + 10_000).toISOString(),
    };
    const store = makeTokenStore(tokens);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-at',
        token_type: 'bearer',
        expires_in: 3600,
        scope: 'identity',
      }),
    });
    const client = new RedditClient(CFG, store, fetchMock as unknown as typeof fetch);
    const t = await client.ensureValidToken('acc-1');
    expect(t).toBe('refreshed-at');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when no stored tokens', async () => {
    const store = makeTokenStore(null);
    const client = new RedditClient(CFG, store, vi.fn() as unknown as typeof fetch);
    await expect(client.ensureValidToken('acc-1')).rejects.toThrow(/No Reddit tokens/);
  });
});

describe('RedditClient.submit', () => {
  const validTokens: RedditTokens = {
    accessToken: 'at-1',
    refreshToken: 'rt',
    scope: 'submit',
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };

  it('returns id + url on happy path', async () => {
    const store = makeTokenStore(validTokens);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        json: {
          errors: [],
          data: { id: 'abc123', name: 't3_abc123', url: 'https://reddit.com/r/test/comments/abc123' },
        },
      }),
    });
    const client = new RedditClient(CFG, store, fetchMock as unknown as typeof fetch);
    const r = await client.submit('acc-1', {
      subreddit: 'test',
      title: 'Hello',
      body: 'body text',
    });
    expect(r.id).toBe('t3_abc123');
    expect(r.url).toContain('/r/test/');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('sr=test');
    expect(String(init.body)).toContain('title=Hello');
  });

  it('throws on non-ok', async () => {
    const store = makeTokenStore(validTokens);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: async () => ({}) });
    const client = new RedditClient(CFG, store, fetchMock as unknown as typeof fetch);
    await expect(
      client.submit('acc-1', { subreddit: 'x', title: 't', body: 'b' }),
    ).rejects.toThrow(/403/);
  });
});
