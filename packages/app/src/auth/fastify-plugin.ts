import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';
import { issuerForRealm, jwksUriForRealm, verifyKeycloakToken } from './keycloak-jwt.js';
import type { AuthenticatedUser } from './types.js';

const log = childLogger('auth.plugin');

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
  interface FastifyInstance {
    authenticate: preHandlerHookHandler;
  }
}

const BEARER_PREFIX = 'Bearer ';

const bypassUser: AuthenticatedUser = {
  sub: 'dev-bypass',
  username: 'dev',
  email: 'dev@local',
  realmRoles: ['ROLE_ADMIN'],
};

/**
 * Register the `app.authenticate` preHandler. Parses the `Authorization`
 * header, verifies via JWKS, and populates `req.user`. With
 * AUTH_DEV_BYPASS=true every request is treated as a synthetic owner so
 * downstream role guards still see `ROLE_ADMIN`.
 */
export async function registerAuthPlugin(app: FastifyInstance): Promise<void> {
  const env = getEnv();
  const jwksUri = jwksUriForRealm(env.KEYCLOAK_URL, env.KEYCLOAK_REALM);
  const issuer = issuerForRealm(env.KEYCLOAK_ISSUER_URL ?? env.KEYCLOAK_URL, env.KEYCLOAK_REALM);

  if (env.AUTH_DEV_BYPASS) {
    log.warn({ jwksUri, issuer }, 'AUTH_DEV_BYPASS=true — all requests treated as ROLE_ADMIN');
  } else {
    log.info({ jwksUri, issuer }, 'auth enabled — JWKS verification active');
  }

  const authenticate: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    if (env.AUTH_DEV_BYPASS) {
      req.user = bypassUser;
      return;
    }
    const header = req.headers.authorization;
    if (!header?.startsWith(BEARER_PREFIX)) {
      reply.code(401).send({ error: 'Unauthorized', reason: 'missing bearer token' });
      return;
    }
    const token = header.slice(BEARER_PREFIX.length).trim();
    try {
      req.user = await verifyKeycloakToken({ token, jwksUri, issuer });
    } catch (err) {
      log.warn({ err: (err as Error).message }, 'token verification failed');
      reply.code(401).send({ error: 'Unauthorized', reason: 'invalid token' });
    }
  };

  app.decorate('authenticate', authenticate);
}
