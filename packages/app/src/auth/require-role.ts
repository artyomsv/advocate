import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { AuthenticatedUser } from './types.js';

/**
 * Reject the request unless the authenticated user carries `roleName` in
 * their realm roles. Requires an earlier preHandler (typically `authenticate`)
 * to have populated `req.user`. Returns 401 if absent, 403 if role missing.
 */
export function requireRole(roleName: string): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const user = (req as FastifyRequest & { user?: AuthenticatedUser }).user;
    if (!user) {
      reply.code(401).send({ error: 'Unauthorized' });
      return;
    }
    if (!user.realmRoles.includes(roleName)) {
      reply.code(403).send({ error: 'Forbidden', missingRole: roleName });
    }
  };
}
