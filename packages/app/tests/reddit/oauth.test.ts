import { describe, expect, it, vi } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  type RedditAppConfig,
  refreshAccessToken,
} from '../../src/reddit/oauth.js';

const CFG: RedditAppConfig = {
  clientId: 'cid-abc',
  clientSecret: 'csec-xyz',
  redirectUri: 'http://localhost:36401/oauth/reddit/callback',
  userAgent: 'mynah/0.1 (by /u/owner)',
};

describe('reddit oauth', () => {
  it('buildAuthorizeUrl includes required params', () => {
    const url = buildAuthorizeUrl(CFG, 'state-abc');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://www.reddit.com/api/v1/authorize');
    expect(parsed.searchParams.get('client_id')).toBe('cid-abc');
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('duration')).toBe('permanent');
    expect(parsed.searchParams.get('scope')).toMatch(/identity/);
    expect(parsed.searchParams.get('state')).toBe('state-abc');
  });

  it('exchangeCodeForToken posts the correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at-1',
        token_type: 'bearer' as const,
        expires_in: 3600,
        scope: 'identity',
        refresh_token: 'rt-1',
      }),
    });
    const r = await exchangeCodeForToken(
      CFG,
      'the-code',
      mockFetch as unknown as typeof fetch,
    );
    expect(r.access_token).toBe('at-1');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(String(init.body)).toContain('grant_type=authorization_code');
    expect(String(init.body)).toContain('code=the-code');
  });

  it('exchangeCodeForToken throws on non-ok response', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(
      exchangeCodeForToken(CFG, 'bad', mockFetch as unknown as typeof fetch),
    ).rejects.toThrow(/401/);
  });

  it('refreshAccessToken posts grant_type=refresh_token', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'at-2',
        token_type: 'bearer' as const,
        expires_in: 3600,
        scope: 'identity',
      }),
    });
    const r = await refreshAccessToken(CFG, 'rt-1', mockFetch as unknown as typeof fetch);
    expect(r.access_token).toBe('at-2');
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(String(init.body)).toContain('grant_type=refresh_token');
  });
});
