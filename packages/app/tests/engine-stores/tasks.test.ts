import type { AgentId, ProjectId } from '@mynah/engine';
import { IllegalTransitionError } from '@mynah/engine';
import { randomUUID } from 'node:crypto';
import { like } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, getDb } from '../../src/db/connection.js';
import { agentTasks, agents, taskArtifacts, taskComments } from '../../src/db/schema.js';
import { DrizzleKanbanBoard } from '../../src/engine-stores/tasks/drizzle-kanban-board.js';

const PREFIX = `tasks-test-${Date.now()}`;

async function cleanup(): Promise<void> {
  const db = getDb();
  await db.delete(taskArtifacts);
  await db.delete(taskComments);
  await db.delete(agentTasks);
  await db.delete(agents).where(like(agents.name, `${PREFIX}%`));
}

async function seedAgent(suffix: string): Promise<AgentId> {
  const db = getDb();
  const [row] = await db
    .insert(agents)
    .values({
      name: `${PREFIX}-${suffix}`,
      role: 'test',
      soul: 's',
      modelConfig: {},
      memoryConfig: {},
      permissions: [],
    })
    .returning();
  if (!row) throw new Error('agent insert failed');
  return row.id as AgentId;
}

describe('DrizzleKanbanBoard', () => {
  beforeAll(cleanup);
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });
  beforeEach(cleanup);

  it('createTask round-trips with defaults + listTasks returns newest first', async () => {
    const board = new DrizzleKanbanBoard(getDb());
    const creator = await seedAgent('t1');
    const projectId = randomUUID() as ProjectId;
    const a = await board.createTask({
      projectId,
      title: 'First',
      description: 'd',
      type: 'content_draft',
      createdBy: creator,
    });
    const b = await board.createTask({
      projectId,
      title: 'Second',
      description: 'd',
      type: 'content_draft',
      createdBy: creator,
    });
    const rows = await board.listTasks({ projectId });
    expect(rows.map((r) => r.id)).toEqual([b.id, a.id]);
    expect(rows[0]!.status).toBe('backlog');
    expect(rows[0]!.priority).toBe('medium');
  });

  it('updateStatus follows transition rules + stamps startedAt/completedAt', async () => {
    const board = new DrizzleKanbanBoard(getDb());
    const creator = await seedAgent('t2');
    const projectId = randomUUID() as ProjectId;
    const t = await board.createTask({
      projectId,
      title: 'go',
      description: 'd',
      type: 'x',
      createdBy: creator,
    });
    const started = await board.updateStatus(t.id, 'in_progress', creator);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBeDefined();
    const reviewing = await board.updateStatus(t.id, 'in_review', creator);
    expect(reviewing.status).toBe('in_review');
    const approved = await board.updateStatus(t.id, 'approved', creator);
    expect(approved.status).toBe('approved');
    const done = await board.updateStatus(t.id, 'done', creator);
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeDefined();
  });

  it('rejects illegal transitions (backlog → done)', async () => {
    const board = new DrizzleKanbanBoard(getDb());
    const creator = await seedAgent('t3');
    const t = await board.createTask({
      projectId: randomUUID() as ProjectId,
      title: 'bad',
      description: 'd',
      type: 'x',
      createdBy: creator,
    });
    await expect(board.updateStatus(t.id, 'done', creator)).rejects.toBeInstanceOf(
      IllegalTransitionError,
    );
  });

  it('addComment + getComments round-trip', async () => {
    const board = new DrizzleKanbanBoard(getDb());
    const creator = await seedAgent('t4');
    const t = await board.createTask({
      projectId: randomUUID() as ProjectId,
      title: 'commented',
      description: 'd',
      type: 'x',
      createdBy: creator,
    });
    await board.addComment(t.id, creator, 'first', 'test-role');
    await board.addComment(t.id, creator, 'second', 'test-role');
    const comments = await board.getComments(t.id);
    expect(comments).toHaveLength(2);
    expect(comments[0]!.content).toBe('first');
  });

  it('addArtifact + getArtifacts round-trip', async () => {
    const board = new DrizzleKanbanBoard(getDb());
    const creator = await seedAgent('t5');
    const t = await board.createTask({
      projectId: randomUUID() as ProjectId,
      title: 'artifacted',
      description: 'd',
      type: 'x',
      createdBy: creator,
    });
    await board.addArtifact(t.id, {
      type: 'draft',
      content: 'body',
      createdBy: creator,
    });
    const arts = await board.getArtifacts(t.id);
    expect(arts).toHaveLength(1);
    expect(arts[0]!.content).toBe('body');
  });
});
