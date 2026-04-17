import { describe, expect, it, vi } from 'vitest';
import { RedditClient } from '../../src/reddit/client.js';
import type { RedditAppConfig } from '../../src/reddit/oauth.js';
import type { RedditTokens, RedditTokenStore } from '../../src/reddit/tokens.js';

const CFG: RedditAppConfig = {
  clientId: 'cid',
  clientSecret: 'csec',
  redirectUri: 'http://localhost:36401/oauth/reddit/callback',
  userAgent: 'mynah-test',
};

const validTokens: RedditTokens = {
  accessToken: 'at',
  refreshToken: 'rt',
  scope: 'read',
  expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
};

function makeStore(): RedditTokenStore {
  return {
    save: async () => undefined,
    load: async () => validTokens,
  } as unknown as RedditTokenStore;
}

function mockListing(
  children: Array<{ kind: string; data: Record<string, unknown> }>,
): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { children } }),
  }) as unknown as typeof fetch;
}

describe('fetchListing', () => {
  it('parses a normal self-post', async () => {
    const fetchImpl = mockListing([
      {
        kind: 't3',
        data: {
          id: 'abc',
          name: 't3_abc',
          title: 'What book for my 4yr old?',
          selftext: 'Recommendations welcome.',
          url: 'https://reddit.com/x',
          permalink: '/r/Parenting/comments/abc/...',
          subreddit: 'Parenting',
          author: 'someone',
          score: 42,
          num_comments: 5,
          created_utc: 1_700_000_000,
          is_self: true,
        },
      },
    ]);
    const client = new RedditClient(CFG, makeStore(), fetchImpl);
    const threads = await client.fetchListing('acc', 'Parenting');
    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: 'abc',
      title: 'What book for my 4yr old?',
      isSelfPost: true,
      score: 42,
      subreddit: 'Parenting',
    });
    expect(threads[0]?.permalink).toContain('reddit.com/r/Parenting');
  });

  it('filters out stickied + nsfw + promoted', async () => {
    const fetchImpl = mockListing([
      { kind: 't3', data: { id: 'ok', title: 'Normal', is_self: true } },
      { kind: 't3', data: { id: 'sticky', title: 'Sticky', stickied: true } },
      { kind: 't3', data: { id: 'nsfw', title: 'NSFW', over_18: true } },
      { kind: 't3', data: { id: 'ad', title: 'Promoted', promoted: true } },
    ]);
    const client = new RedditClient(CFG, makeStore(), fetchImpl);
    const threads = await client.fetchListing('acc', 'Parenting');
    expect(threads.map((t) => t.id)).toEqual(['ok']);
  });

  it('ignores non-t3 kinds', async () => {
    const fetchImpl = mockListing([
      { kind: 't1', data: { id: 'c1' } },
      { kind: 't3', data: { id: 'ok' } },
    ]);
    const client = new RedditClient(CFG, makeStore(), fetchImpl);
    const threads = await client.fetchListing('acc', 'Parenting');
    expect(threads.map((t) => t.id)).toEqual(['ok']);
  });

  it('throws on non-ok', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const client = new RedditClient(CFG, makeStore(), fetchImpl as unknown as typeof fetch);
    await expect(client.fetchListing('acc', 'x')).rejects.toThrow(/429/);
  });
});
