import type { JSX } from 'react';
import {
  type Task,
  type TaskStatus,
  useTasks,
  useUpdateTaskStatus,
} from '../../hooks/useTasks';

const COLUMNS: { id: ColumnId; label: string; statuses: readonly TaskStatus[] }[] = [
  { id: 'backlog', label: 'Backlog', statuses: ['backlog'] },
  { id: 'in_progress', label: 'In progress', statuses: ['in_progress', 'in_review', 'approved'] },
  { id: 'blocked', label: 'Blocked', statuses: ['blocked'] },
  { id: 'done', label: 'Done', statuses: ['done'] },
];

type ColumnId = 'backlog' | 'in_progress' | 'blocked' | 'done';

const AGENT_NAME: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'Campaign Lead',
  '00000000-0000-4000-a000-000000000002': 'Strategist',
  '00000000-0000-4000-a000-000000000003': 'Content Writer',
  '00000000-0000-4000-a000-000000000004': 'Quality Gate',
  '00000000-0000-4000-a000-000000000005': 'Safety Worker',
};

export function Tasks(): JSX.Element {
  const q = useTasks();
  const tasks = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Tasks</h1>
        <span className="text-xs text-[var(--fg-subtle)]">
          {tasks.length} task{tasks.length === 1 ? '' : 's'}
        </span>
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No tasks yet. Every orchestrator run creates a task — trigger a draft
          or run <code className="text-[var(--color-accent)]">pnpm smoke:e2e</code>.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const columnTasks = tasks.filter((t) => col.statuses.includes(t.status));
            return (
              <Column key={col.id} label={col.label} tasks={columnTasks} />
            );
          })}
        </div>
      )}
    </div>
  );
}

function Column({ label, tasks }: { label: string; tasks: Task[] }): JSX.Element {
  return (
    <div className="glass flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-[var(--fg-subtle)]">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded border border-dashed border-[var(--glass-border)] p-3 text-xs text-[var(--fg-subtle)]">
            empty
          </div>
        )}
      </div>
    </div>
  );
}

const ALL_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'in_progress',
  'in_review',
  'approved',
  'done',
  'blocked',
];

function TaskCard({ task }: { task: Task }): JSX.Element {
  const assigned = task.assignedTo ? AGENT_NAME[task.assignedTo] ?? task.assignedTo.slice(0, 8) : null;
  const creator = AGENT_NAME[task.createdBy] ?? task.createdBy.slice(0, 8);
  const update = useUpdateTaskStatus();

  return (
    <div className="rounded border border-[var(--glass-border)] bg-[var(--glass-hover)] p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium leading-snug">{task.title}</span>
        <PriorityBadge priority={task.priority} />
      </div>
      <div className="mt-1 text-xs text-[var(--fg-muted)]">{task.description}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--fg-subtle)]">
        <span>by {creator}</span>
        {assigned && <span>→ {assigned}</span>}
        <span>· {new Date(task.createdAt).toLocaleString()}</span>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label className="text-[var(--fg-subtle)]">move to</label>
        <select
          value={task.status}
          disabled={update.isPending}
          onChange={(e) => update.mutate({ id: task.id, status: e.target.value as TaskStatus })}
          className="rounded border border-[var(--glass-border)] bg-transparent px-1.5 py-0.5 text-xs text-[var(--fg)] outline-none hover:border-[var(--color-accent)]"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s} className="bg-[var(--bg-elevated)]">
              {s.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Task['priority'] }): JSX.Element {
  const color =
    priority === 'critical'
      ? 'bg-red-500/15 text-red-400'
      : priority === 'high'
        ? 'bg-amber-500/15 text-amber-400'
        : priority === 'medium'
          ? 'bg-sky-500/15 text-sky-400'
          : 'bg-[var(--glass-border)] text-[var(--fg-subtle)]';
  return (
    <span className={`inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${color}`}>
      {priority}
    </span>
  );
}
