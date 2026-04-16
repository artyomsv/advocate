import { createRemoteJWKSet, jwtVerify } from 'jose';
import { childLogger } from '../config/logger.js';
import type { AuthenticatedUser, TokenPayload } from './types.js';

const log = childLogger('auth.keycloak');

export interface VerifyTokenOptions {
  token: string;
  jwksUri: string;
  issuer: string;
  /** Audience claim — Keycloak defaults to 'account'; leave undefined to skip. */
  audience?: string;
}

// Memoise one remote key set per JWKS URI. jose handles fetch, TTL caching,
// cooldown between refreshes, and key rotation internally.
const remoteJwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getRemoteJwks(jwksUri: string): ReturnType<typeof createRemoteJWKSet> {
  let keySet = remoteJwksCache.get(jwksUri);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(jwksUri), {
      cooldownDuration: 30_000,
      cacheMaxAge: 600_000,
    });
    remoteJwksCache.set(jwksUri, keySet);
  }
  return keySet;
}

/**
 * Verify a Keycloak-issued JWT against a JWKS URL. Uses jose's
 * `createRemoteJWKSet` for HTTP fetch + TTL cache + rotation handling.
 */
export async function verifyKeycloakToken(options: VerifyTokenOptions): Promise<AuthenticatedUser> {
  const { token, jwksUri, issuer, audience } = options;

  const keySet = getRemoteJwks(jwksUri);
  const { payload } = await jwtVerify<TokenPayload>(token, keySet, { issuer, audience });

  const realmRoles = payload.realm_access?.roles ?? [];
  log.debug({ sub: payload.sub, realmRoles }, 'token verified');

  return {
    sub: payload.sub,
    username: payload.preferred_username,
    email: payload.email,
    realmRoles,
  };
}

export function jwksUriForRealm(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}/protocol/openid-connect/certs`;
}

export function issuerForRealm(keycloakUrl: string, realm: string): string {
  return `${keycloakUrl.replace(/\/$/, '')}/realms/${realm}`;
}
