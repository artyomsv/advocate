import type { ProjectId } from '@mynah/engine';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb } from '../../db/connection.js';
import { DrizzleKanbanBoard } from '../../engine-stores/tasks/drizzle-kanban-board.js';

const listQuery = z.object({
  projectId: z.string().uuid().optional(),
  status: z
    .enum(['backlog', 'in_progress', 'in_review', 'approved', 'done', 'blocked'])
    .optional(),
});

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  const board = new DrizzleKanbanBoard(getDb());

  app.get('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = listQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const tasks = await board.listTasks({
      projectId: parsed.data.projectId as ProjectId | undefined,
      status: parsed.data.status,
    });
    return tasks;
  });
}
