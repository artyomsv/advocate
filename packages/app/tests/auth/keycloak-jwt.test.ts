import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verifyKeycloakToken } from '../../src/auth/keycloak-jwt.js';

describe('verifyKeycloakToken', () => {
  let server: Server;
  let privateKey: CryptoKey;
  let kid: string;
  let issuerBase: string;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    const jwk = await exportJWK(keyPair.publicKey);
    kid = 'test-kid-1';
    const jwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };

    server = createServer((req, res) => {
      if (req.url?.endsWith('/protocol/openid-connect/certs')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    }).listen(0);
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    issuerBase = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function mintToken(overrides: Record<string, unknown> = {}): Promise<string> {
    return new SignJWT({
      sub: 'user-1',
      preferred_username: 'owner',
      email: 'owner@example.com',
      realm_access: { roles: ['ROLE_ADMIN', 'ROLE_USER'] },
      ...overrides,
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/mynah`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(privateKey);
  }

  it('verifies a valid token and returns the payload', async () => {
    const token = await mintToken();
    const user = await verifyKeycloakToken({
      token,
      jwksUri: `${issuerBase}/realms/mynah/protocol/openid-connect/certs`,
      issuer: `${issuerBase}/realms/mynah`,
    });
    expect(user.sub).toBe('user-1');
    expect(user.username).toBe('owner');
    expect(user.realmRoles).toContain('ROLE_ADMIN');
  });

  it('rejects a token signed by an unknown key', async () => {
    const otherPair = await generateKeyPair('RS256', { extractable: true });
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'RS256', kid: 'unknown-kid' })
      .setIssuer(`${issuerBase}/realms/mynah`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(otherPair.privateKey);
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/mynah/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/mynah`,
      }),
    ).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await new SignJWT({ sub: 'user-1' })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/mynah`)
      .setAudience('account')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .sign(privateKey);
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/mynah/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/mynah`,
      }),
    ).rejects.toThrow();
  });

  it('rejects a token with the wrong issuer', async () => {
    const token = await mintToken();
    await expect(
      verifyKeycloakToken({
        token,
        jwksUri: `${issuerBase}/realms/mynah/protocol/openid-connect/certs`,
        issuer: `${issuerBase}/realms/SOMETHING-ELSE`,
      }),
    ).rejects.toThrow();
  });
});
