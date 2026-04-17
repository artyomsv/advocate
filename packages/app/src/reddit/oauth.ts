export interface RedditAppConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  userAgent: string;
}

export interface RedditTokenResponse {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  scope: string;
  refresh_token?: string;
}

export const REDDIT_SCOPES = 'identity read submit history edit' as const;

export function buildAuthorizeUrl(
  config: RedditAppConfig,
  state: string,
  duration: 'temporary' | 'permanent' = 'permanent',
): string {
  const url = new URL('https://www.reddit.com/api/v1/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('duration', duration);
  url.searchParams.set('scope', REDDIT_SCOPES);
  return url.toString();
}

function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

export async function exchangeCodeForToken(
  config: RedditAppConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(config.clientId, config.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Reddit token exchange failed: ${res.status}`);
  }
  return (await res.json()) as RedditTokenResponse;
}

export async function refreshAccessToken(
  config: RedditAppConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RedditTokenResponse> {
  const res = await fetchImpl('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: basicAuth(config.clientId, config.clientSecret),
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.userAgent,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!res.ok) {
    throw new Error(`Reddit token refresh failed: ${res.status}`);
  }
  return (await res.json()) as RedditTokenResponse;
}
