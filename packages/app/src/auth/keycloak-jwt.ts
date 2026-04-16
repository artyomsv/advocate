import { createLocalJWKSet, type JWK, jwtVerify } from 'jose';
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

/**
 * Verify a Keycloak-issued JWT against a JWKS URL.
 *
 * Fetches the JWKS from `jwksUri` via node:fetch and uses `jose`'s
 * `createLocalJWKSet` + `jwtVerify` for signature verification and
 * claim validation (issuer, expiry, audience).
 */
export async function verifyKeycloakToken(options: VerifyTokenOptions): Promise<AuthenticatedUser> {
  const { token, jwksUri, issuer, audience } = options;

  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS from ${jwksUri}: HTTP ${response.status}`);
  }
  const jwksJson = (await response.json()) as { keys: JWK[] };
  const keySet = createLocalJWKSet({ keys: jwksJson.keys });

  const { payload } = await jwtVerify<TokenPayload>(token, keySet, {
    issuer,
    audience,
  });

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
