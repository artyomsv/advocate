import type { AgentId, ProjectId, TaskId } from '@mynah/engine';
import { IllegalTransitionError } from '@mynah/engine';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SEED_AGENT_IDS } from '../../bootstrap/seed-agents.js';
import { getDb } from '../../db/connection.js';
import { DrizzleKanbanBoard } from '../../engine-stores/tasks/drizzle-kanban-board.js';

const listQuery = z.object({
  projectId: z.string().uuid().optional(),
  status: z
    .enum(['backlog', 'in_progress', 'in_review', 'approved', 'done', 'blocked'])
    .optional(),
});

const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  description: z.string().default(''),
  type: z.string().default('manual'),
  priority: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
  assignedTo: z.string().uuid().optional(),
  createdBy: z.string().uuid().optional(),
});

const statusSchema = z.object({
  status: z.enum(['backlog', 'in_progress', 'in_review', 'approved', 'done', 'blocked']),
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

  app.post('/tasks', { preHandler: [app.authenticate] }, async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
    }
    const created = await board.createTask({
      projectId: parsed.data.projectId as ProjectId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      priority: parsed.data.priority,
      assignedTo: parsed.data.assignedTo as AgentId | undefined,
      // Default createdBy to Campaign Lead (the orchestrator's task creator).
      createdBy: (parsed.data.createdBy ?? SEED_AGENT_IDS.campaignLead) as AgentId,
    });
    return reply.code(201).send(created);
  });

  app.patch<{ Params: { id: string } }>(
    '/tasks/:id/status',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'ValidationError', issues: parsed.error.issues });
      }
      try {
        const updated = await board.updateStatus(
          req.params.id as TaskId,
          parsed.data.status,
          SEED_AGENT_IDS.campaignLead as AgentId,
        );
        return updated;
      } catch (err) {
        if (err instanceof IllegalTransitionError) {
          return reply.code(409).send({ error: 'IllegalTransition', message: err.message });
        }
        if (err instanceof Error && /not found/i.test(err.message)) {
          return reply.code(404).send({ error: 'NotFound', message: err.message });
        }
        throw err;
      }
    },
  );
}
