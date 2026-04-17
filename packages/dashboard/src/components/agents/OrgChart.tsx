import type { JSX } from 'react';
import type { AgentStatus } from '../../hooks/useAgents';

interface Layout {
  x: number;
  y: number;
}

const NODE_W = 220;
const NODE_H = 110;
const VIEW_W = 880;
const VIEW_H = 480;

const LAYOUT: Record<string, Layout> = {
  'campaign-lead': { x: VIEW_W / 2 - NODE_W / 2, y: 20 },
  strategist: { x: 60, y: 180 },
  'quality-gate': { x: VIEW_W / 2 - NODE_W / 2, y: 180 },
  'safety-worker': { x: VIEW_W - NODE_W - 60, y: 180 },
  'content-writer': { x: 60, y: 340 },
};

const EDGES: [string, string][] = [
  ['campaign-lead', 'strategist'],
  ['campaign-lead', 'quality-gate'],
  ['campaign-lead', 'safety-worker'],
  ['strategist', 'content-writer'],
];

function centerOf(id: string): { x: number; y: number } {
  const pos = LAYOUT[id];
  if (!pos) return { x: 0, y: 0 };
  return { x: pos.x + NODE_W / 2, y: pos.y + NODE_H / 2 };
}

function edgePath(from: string, to: string): string {
  const a = centerOf(from);
  const b = centerOf(to);
  // Exit from bottom of parent, enter top of child
  const ax = a.x;
  const ay = a.y + NODE_H / 2;
  const bx = b.x;
  const by = b.y - NODE_H / 2;
  const midY = (ay + by) / 2;
  return `M ${ax} ${ay} C ${ax} ${midY}, ${bx} ${midY}, ${bx} ${by}`;
}

export function OrgChart({ agents }: { agents: AgentStatus[] }): JSX.Element {
  const byId = new Map(agents.map((a) => [a.agentId, a]));

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full min-w-[${VIEW_W}px]"
        style={{ minWidth: VIEW_W }}
      >
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--border-strong)" />
          </marker>
        </defs>
        {EDGES.map(([from, to]) => (
          <path
            key={`${from}-${to}`}
            d={edgePath(from, to)}
            fill="none"
            stroke="var(--border-strong)"
            strokeWidth={1.5}
            markerEnd="url(#arrow)"
          />
        ))}
        {Object.entries(LAYOUT).map(([id, pos]) => {
          const agent = byId.get(id);
          return (
            <foreignObject
              key={id}
              x={pos.x}
              y={pos.y}
              width={NODE_W}
              height={NODE_H}
            >
              <NodeCard
                agentId={id}
                name={agent?.name ?? id}
                role={agent?.role ?? ''}
                status={agent?.status ?? 'idle'}
                runsToday={agent?.runsToday ?? 0}
                costMillicentsToday={agent?.costMillicentsToday ?? 0}
              />
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

function StatusDot({ status }: { status: AgentStatus['status'] }): JSX.Element {
  const color =
    status === 'ready'
      ? 'bg-emerald-400'
      : status === 'running'
        ? 'bg-[var(--color-accent)]'
        : status === 'error'
          ? 'bg-red-400'
          : 'bg-[var(--fg-subtle)]';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function NodeCard({
  name,
  role,
  status,
  runsToday,
  costMillicentsToday,
}: {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus['status'];
  runsToday: number;
  costMillicentsToday: number;
}): JSX.Element {
  const cost = (costMillicentsToday / 100_000).toFixed(5);
  return (
    <div className="glass flex h-full flex-col justify-between p-3 text-[var(--fg)]">
      <div>
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">{name}</div>
          <StatusDot status={status} />
        </div>
        <div className="mt-1 text-xs text-[var(--fg-muted)]">{role}</div>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--fg-subtle)]">
        <span>{runsToday} today</span>
        <span>${cost}</span>
      </div>
    </div>
  );
}
