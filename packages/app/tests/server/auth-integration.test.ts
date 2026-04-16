import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../../src/server/server.js';

describe('auth integration', () => {
  let jwksServer: Server;
  let privateKey: CryptoKey;
  let issuerBase: string;
  let kid: string;
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    const keyPair = await generateKeyPair('RS256', { extractable: true });
    privateKey = keyPair.privateKey;
    kid = 'itest-kid';
    const jwk = await exportJWK(keyPair.publicKey);
    const jwks = { keys: [{ ...jwk, kid, use: 'sig', alg: 'RS256' }] };

    jwksServer = createServer((req, res) => {
      if (req.url?.endsWith('/protocol/openid-connect/certs')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(jwks));
        return;
      }
      res.writeHead(404);
      res.end();
    }).listen(0);
    const addr = jwksServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 0;
    issuerBase = `http://127.0.0.1:${port}`;

    process.env.KEYCLOAK_URL = issuerBase;
    process.env.KEYCLOAK_REALM = 'mynah';
    process.env.AUTH_DEV_BYPASS = 'false';
    const { resetEnvForTest } = await import('../../src/config/env.js');
    resetEnvForTest();

    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
    // Restore bypass for downstream tests that expect it.
    process.env.AUTH_DEV_BYPASS = 'true';
    const { resetEnvForTest } = await import('../../src/config/env.js');
    resetEnvForTest();
  });

  async function mintToken(roles: readonly string[] = ['ROLE_ADMIN']): Promise<string> {
    return new SignJWT({
      sub: 'test-user',
      preferred_username: 'tester',
      email: 'tester@example.com',
      realm_access: { roles },
    })
      .setProtectedHeader({ alg: 'RS256', kid })
      .setIssuer(`${issuerBase}/realms/mynah`)
      .setAudience('account')
      .setExpirationTime('5m')
      .setIssuedAt()
      .sign(privateKey);
  }

  it('rejects GET /products without Authorization header', async () => {
    const res = await app.inject({ method: 'GET', url: '/products' });
    expect(res.statusCode).toBe(401);
  });

  it('rejects GET /products with a bogus token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { authorization: 'Bearer not.a.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('accepts GET /products with a valid owner token', async () => {
    const token = await mintToken();
    const res = await app.inject({
      method: 'GET',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('allows GET /health without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });
});
