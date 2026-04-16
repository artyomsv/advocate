# Authentication

This service validates Keycloak-issued JWTs on every non-health route.

## Realm

- **Keycloak URL:** `http://localhost:9080` (dev) / managed in production
- **Realm:** `mynah`
- **SPA client ID:** `mynah-dashboard` (publicClient + PKCE S256)
- **Realm roles used by this service:** `ROLE_ADMIN`, `ROLE_USER`, `ROLE_INTERNAL`
- **Gating role for MVP:** `ROLE_ADMIN` — every protected route rejects tokens that do not include it.

The realm JSON lives in the shared Keycloak repo at
`E:/Projects/Stukans/monorepo/auth/realms/mynah-realm.json` and is auto-imported
on Keycloak container boot.

## Endpoints the app hits

- JWKS: `http://localhost:9080/realms/mynah/protocol/openid-connect/certs`
- Issuer (`iss` claim): `http://localhost:9080/realms/mynah`

Both are built at runtime from `KEYCLOAK_URL` + `KEYCLOAK_REALM`.

## Dev owner user

Username `owner`, password `Mynah-Dev-2026!`, role `ROLE_ADMIN`.

## Dev bypass

Set `AUTH_DEV_BYPASS=true` to short-circuit the `authenticate` preHandler.
All requests are treated as the owner (`ROLE_ADMIN`) — useful for local smoke
tests and existing integration tests that predate auth. The app refuses to
boot if `NODE_ENV=production && AUTH_DEV_BYPASS=true`.
