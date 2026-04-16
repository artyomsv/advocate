import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { InMemoryKanbanBoard } from '../../src/tasks/board.js';
import type { AgentId, ProjectId, TaskId } from '../../src/types/ids.js';

const actor = randomUUID() as AgentId;
const assignee = randomUUID() as AgentId;
const project = randomUUID() as ProjectId;

describe('InMemoryKanbanBoard', () => {
  let board: InMemoryKanbanBoard;

  beforeEach(() => {
    board = new InMemoryKanbanBoard();
  });

  it('createTask assigns id, createdAt, default priority + status, empty deps', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 'Review content',
      description: 'Check for promo smell',
      type: 'content_review',
      createdBy: actor,
    });
    expect(task.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(task.priority).toBe('medium');
    expect(task.status).toBe('backlog');
    expect(task.dependsOn).toEqual([]);
    expect(task.createdAt).toMatch(/^\d{4}-/);
  });

  it('listTasks filters by projectId, assignedTo, status, type', async () => {
    const otherProject = randomUUID() as ProjectId;
    await board.createTask({
      projectId: project,
      title: 't1',
      description: '',
      type: 'x',
      createdBy: actor,
      assignedTo: assignee,
    });
    await board.createTask({
      projectId: otherProject,
      title: 't2',
      description: '',
      type: 'y',
      createdBy: actor,
    });
    expect(await board.listTasks({ projectId: project })).toHaveLength(1);
    expect(await board.listTasks({ projectId: otherProject, type: 'y' })).toHaveLength(1);
    expect(await board.listTasks({ assignedTo: assignee })).toHaveLength(1);
    expect(await board.listTasks({ status: 'done' })).toHaveLength(0);
  });

  it('updateStatus enforces transitions + stamps startedAt/completedAt', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const started = await board.updateStatus(task.id, 'in_progress', actor);
    expect(started.status).toBe('in_progress');
    expect(started.startedAt).toBeDefined();

    const inReview = await board.updateStatus(task.id, 'in_review', actor);
    const approved = await board.updateStatus(inReview.id, 'approved', actor);
    const done = await board.updateStatus(approved.id, 'done', actor);
    expect(done.status).toBe('done');
    expect(done.completedAt).toBeDefined();
  });

  it('updateStatus rejects illegal transitions with IllegalTransitionError', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    await expect(board.updateStatus(task.id, 'done', actor)).rejects.toThrow(/Illegal/);
  });

  it('updateStatus throws on unknown taskId', async () => {
    await expect(board.updateStatus(randomUUID() as TaskId, 'in_progress', actor)).rejects.toThrow(
      /not found/,
    );
  });

  it('assign updates assignedTo', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const assigned = await board.assign(task.id, assignee);
    expect(assigned.assignedTo).toBe(assignee);
  });

  it('addComment + getComments', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    await board.addComment(task.id, actor, 'looks good', 'reviewer');
    await board.addComment(task.id, assignee, 'agreed', 'content_writer');
    const comments = await board.getComments(task.id);
    expect(comments).toHaveLength(2);
    expect(comments[0]?.content).toBe('looks good');
    expect(comments[0]?.agentRole).toBe('reviewer');
  });

  it('addArtifact + getArtifacts', async () => {
    const task = await board.createTask({
      projectId: project,
      title: 't',
      description: '',
      type: 'x',
      createdBy: actor,
    });
    const artifact = await board.addArtifact(task.id, {
      type: 'content_draft',
      content: 'Hey folks...',
      createdBy: assignee,
    });
    expect(artifact.id).toMatch(/^[0-9a-f-]{36}$/);
    const artifacts = await board.getArtifacts(task.id);
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0]?.content).toContain('Hey folks');
  });

  it('addComment / addArtifact throw on unknown taskId', async () => {
    const missing = randomUUID() as TaskId;
    await expect(board.addComment(missing, actor, 'x', 'role')).rejects.toThrow(/not found/);
    await expect(
      board.addArtifact(missing, { type: 't', content: 'c', createdBy: actor }),
    ).rejects.toThrow(/not found/);
  });
});
