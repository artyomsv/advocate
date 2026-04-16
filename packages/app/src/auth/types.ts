/**
 * Shape pulled off a verified Keycloak access token. Keycloak's standard
 * claims include `sub` (user id), `preferred_username`, `email`,
 * `realm_access.roles`, and `resource_access.<client>.roles`.
 */
export interface TokenPayload {
  sub: string;
  iss: string;
  aud?: string | readonly string[];
  exp: number;
  iat: number;
  preferred_username?: string;
  email?: string;
  realm_access?: { roles?: readonly string[] };
  resource_access?: Record<string, { roles?: readonly string[] }>;
}

/** Decoded + validated user, attached to `req.user` by the preHandler. */
export interface AuthenticatedUser {
  sub: string;
  username?: string;
  email?: string;
  realmRoles: readonly string[];
}
