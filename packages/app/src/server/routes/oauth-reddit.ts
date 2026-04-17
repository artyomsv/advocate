import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getEnv } from '../../config/env.js';
import { getDb } from '../../db/connection.js';
import { LegendAccountService } from '../../legend-accounts/account.service.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  type RedditAppConfig,
} from '../../reddit/oauth.js';
import { decodeState, encodeState, newNonce } from '../../reddit/state.js';
import { RedditTokenStore } from '../../reddit/tokens.js';
import { SecretsService } from '../../secrets/secrets.service.js';

async function resolveConfig(secrets: SecretsService): Promise<RedditAppConfig | null> {
  const clientId = await secrets.resolve('reddit', 'REDDIT_CLIENT_ID');
  const clientSecret = await secrets.resolve('reddit', 'REDDIT_CLIENT_SECRET');
  const redirectUri = await secrets.resolve('reddit', 'REDDIT_REDIRECT_URI');
  const userAgent = await secrets.resolve('reddit', 'REDDIT_USER_AGENT');
  if (!clientId || !clientSecret || !redirectUri || !userAgent) return null;
  return { clientId, clientSecret, redirectUri, userAgent };
}

const authorizeQuery = z.object({ legendAccountId: z.string().uuid() });

const callbackQuery = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1).optional(),
  error: z.string().optional(),
});

export async function registerRedditOAuthRoutes(app: FastifyInstance): Promise<void> {
  const secrets = new SecretsService(getDb());
  const legendAccounts = new LegendAccountService(getDb());
  const tokens = new RedditTokenStore(getDb(), getEnv().CREDENTIAL_MASTER_KEY);

  app.get('/oauth/reddit/authorize', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = authorizeQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const cfg = await resolveConfig(secrets);
    if (!cfg) {
      return reply.code(400).send({
        error: 'NotConfigured',
        message:
          'Reddit app credentials are missing. Set them in Settings → Reddit first.',
      });
    }
    const state = encodeState(
      { legendId: parsed.data.legendAccountId, nonce: newNonce() },
      getEnv().CREDENTIAL_MASTER_KEY,
    );
    return reply.redirect(buildAuthorizeUrl(cfg, state));
  });

  // Callback is PUBLIC — Reddit redirects here without our auth cookie.
  // HMAC-signed state is the only thing that proves the flow originated here.
  app.get('/oauth/reddit/callback', async (req, reply) => {
    const parsed = callbackQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError' });
    }
    if (parsed.data.error) {
      return reply.code(400).send({ error: 'OAuthError', reason: parsed.data.error });
    }
    if (!parsed.data.code || !parsed.data.state) {
      return reply.code(400).send({ error: 'MissingCodeOrState' });
    }
    const statePayload = decodeState(parsed.data.state, getEnv().CREDENTIAL_MASTER_KEY);
    if (!statePayload) {
      return reply.code(400).send({ error: 'InvalidState' });
    }
    const cfg = await resolveConfig(secrets);
    if (!cfg) {
      return reply.code(500).send({ error: 'ConfigGone' });
    }

    try {
      await legendAccounts.get(statePayload.legendId);
    } catch {
      return reply.code(404).send({ error: 'LegendAccountNotFound' });
    }

    const tokenResponse = await exchangeCodeForToken(cfg, parsed.data.code);
    const expiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString();
    await tokens.save(statePayload.legendId, {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token ?? '',
      scope: tokenResponse.scope,
      expiresAt,
    });

    const dashboardUrl = process.env.DASHBOARD_URL ?? 'http://localhost:36400';
    return reply.redirect(
      `${dashboardUrl}/legends?reddit=connected&account=${statePayload.legendId}`,
    );
  });
}
