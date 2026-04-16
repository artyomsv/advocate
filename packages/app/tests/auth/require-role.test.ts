import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { requireRole } from '../../src/auth/require-role.js';
import type { AuthenticatedUser } from '../../src/auth/types.js';

function appWithRole(user: AuthenticatedUser | null, role: string): FastifyInstance {
  const app = Fastify();
  app.addHook('onRequest', async (req) => {
    if (user) (req as typeof req & { user: AuthenticatedUser }).user = user;
  });
  app.get('/guarded', { preHandler: requireRole(role) }, async () => ({ ok: true }));
  return app;
}

const baseUser = (roles: string[]): AuthenticatedUser => ({
  sub: 'u',
  username: 'u',
  email: 'u@example.com',
  realmRoles: roles,
});

describe('requireRole', () => {
  it('allows when realmRoles includes the role', async () => {
    const app = appWithRole(baseUser(['ROLE_ADMIN']), 'ROLE_ADMIN');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(200);
  });

  it('rejects with 403 when role missing', async () => {
    const app = appWithRole(baseUser(['ROLE_USER']), 'ROLE_ADMIN');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('Forbidden');
    expect(res.json().missingRole).toBe('ROLE_ADMIN');
  });

  it('rejects with 401 when user absent', async () => {
    const app = appWithRole(null, 'ROLE_ADMIN');
    const res = await app.inject({ method: 'GET', url: '/guarded' });
    expect(res.statusCode).toBe(401);
  });
});
