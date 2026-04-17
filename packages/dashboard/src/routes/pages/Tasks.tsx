import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { type JSX, useState } from 'react';
import {
  type Task,
  type TaskStatus,
  useTasks,
  useUpdateTaskStatus,
} from '../../hooks/useTasks';

type ColumnId = 'backlog' | 'in_progress' | 'blocked' | 'done';

interface ColumnDef {
  id: ColumnId;
  label: string;
  statuses: readonly TaskStatus[];
  /** Target status a dragged card lands in when dropped here. */
  dropStatus: TaskStatus;
}

const COLUMNS: readonly ColumnDef[] = [
  { id: 'backlog', label: 'Backlog', statuses: ['backlog'], dropStatus: 'backlog' },
  {
    id: 'in_progress',
    label: 'In progress',
    statuses: ['in_progress', 'in_review', 'approved'],
    dropStatus: 'in_progress',
  },
  { id: 'blocked', label: 'Blocked', statuses: ['blocked'], dropStatus: 'blocked' },
  { id: 'done', label: 'Done', statuses: ['done'], dropStatus: 'done' },
];

const AGENT_NAME: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'Campaign Lead',
  '00000000-0000-4000-a000-000000000002': 'Strategist',
  '00000000-0000-4000-a000-000000000003': 'Content Writer',
  '00000000-0000-4000-a000-000000000004': 'Quality Gate',
  '00000000-0000-4000-a000-000000000005': 'Safety Worker',
};

const ALL_STATUSES: readonly TaskStatus[] = [
  'backlog',
  'in_progress',
  'in_review',
  'approved',
  'done',
  'blocked',
];

export function Tasks(): JSX.Element {
  const q = useTasks();
  const tasks = q.data ?? [];
  const update = useUpdateTaskStatus();
  const [error, setError] = useState<string | null>(null);

  // Require a small movement before the drag starts so clicks on the
  // dropdown and taps on mobile don't accidentally initiate drags.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function handleDragEnd(event: DragEndEvent): void {
    const taskId = String(event.active.id);
    const overId = event.over?.id;
    if (!overId) return;

    const task = tasks.find((t) => t.id === taskId);
    const target = COLUMNS.find((c) => c.id === overId);
    if (!task || !target) return;
    if (task.status === target.dropStatus) return;
    // Don't collapse a finer-grained status into 'in_progress' just because
    // the column also displays in_review/approved — only change when the
    // current status isn't already grouped in this column.
    if (target.statuses.includes(task.status)) return;

    setError(null);
    update.mutate(
      { id: taskId, status: target.dropStatus },
      {
        onError: (err) => {
          setError(err instanceof Error ? err.message : 'Move rejected');
        },
      },
    );
  }

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
      {error && (
        <div className="glass border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No tasks yet. Every orchestrator run creates a task — trigger a draft
          or run <code className="text-[var(--color-accent)]">pnpm smoke:e2e</code>.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {COLUMNS.map((col) => {
              const columnTasks = tasks.filter((t) => col.statuses.includes(t.status));
              return <Column key={col.id} col={col} tasks={columnTasks} />;
            })}
          </div>
        </DndContext>
      )}
    </div>
  );
}

function Column({ col, tasks }: { col: ColumnDef; tasks: Task[] }): JSX.Element {
  const { isOver, setNodeRef } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      className={`glass flex flex-col gap-2 p-3 transition-colors ${
        isOver ? 'ring-2 ring-[var(--color-accent)]' : ''
      }`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-sm font-medium">{col.label}</span>
        <span className="text-xs text-[var(--fg-subtle)]">{tasks.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {tasks.map((t) => (
          <TaskCard key={t.id} task={t} />
        ))}
        {tasks.length === 0 && (
          <div className="rounded border border-dashed border-[var(--glass-border)] p-3 text-xs text-[var(--fg-subtle)]">
            drop here
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ task }: { task: Task }): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });
  const update = useUpdateTaskStatus();

  const assigned = task.assignedTo
    ? AGENT_NAME[task.assignedTo] ?? task.assignedTo.slice(0, 8)
    : null;
  const creator = AGENT_NAME[task.createdBy] ?? task.createdBy.slice(0, 8);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded border border-[var(--glass-border)] bg-[var(--glass-hover)] p-3 ${
        isDragging ? 'cursor-grabbing opacity-60 shadow-lg' : ''
      }`}
    >
      {/* Drag handle — the card body. The status select below stays outside
          so keyboard users can still transition via the dropdown. */}
      <div {...attributes} {...listeners} className="cursor-grab">
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
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <label className="text-[var(--fg-subtle)]">status</label>
        <select
          value={task.status}
          disabled={update.isPending}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
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
