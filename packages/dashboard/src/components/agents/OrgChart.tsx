import type { JSX } from 'react';
import type { AgentStatus } from '../../hooks/useAgents';

interface Layout {
  x: number;
  y: number;
}

const NODE_W = 220;
const NODE_H = 110;
const GAP = 30;
// 5 middle-row nodes + 4 inter-node gaps + 20px side margins.
const VIEW_W = 5 * NODE_W + 4 * GAP + 2 * 20; // 1260
const VIEW_H = 520;

// Campaign Lead at top (centered). Mid row (y=200) laid out left-to-right:
// Scout, Strategist, Quality Gate, Safety Worker, Analytics Analyst.
// Content Writer sits below Strategist — the Strategist→Writer edge is the
// only intra-pipeline link; every other node hangs directly off the Lead.
const MID_Y = 200;
const BOTTOM_Y = 380;
const LAYOUT: Record<string, Layout> = {
  'campaign-lead': { x: VIEW_W / 2 - NODE_W / 2, y: 20 },
  scout: { x: 20 + 0 * (NODE_W + GAP), y: MID_Y },
  strategist: { x: 20 + 1 * (NODE_W + GAP), y: MID_Y },
  'quality-gate': { x: 20 + 2 * (NODE_W + GAP), y: MID_Y },
  'safety-worker': { x: 20 + 3 * (NODE_W + GAP), y: MID_Y },
  'analytics-analyst': { x: 20 + 4 * (NODE_W + GAP), y: MID_Y },
  'content-writer': { x: 20 + 1 * (NODE_W + GAP), y: BOTTOM_Y },
};

const EDGES: [string, string][] = [
  ['campaign-lead', 'scout'],
  ['campaign-lead', 'strategist'],
  ['campaign-lead', 'quality-gate'],
  ['campaign-lead', 'safety-worker'],
  ['campaign-lead', 'analytics-analyst'],
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

export function OrgChart({
  agents,
  onSelectAgent,
}: { agents: AgentStatus[]; onSelectAgent?: (agentId: string) => void }): JSX.Element {
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
                onClick={onSelectAgent ? () => onSelectAgent(id) : undefined}
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
  onClick,
}: {
  agentId: string;
  name: string;
  role: string;
  status: AgentStatus['status'];
  runsToday: number;
  costMillicentsToday: number;
  onClick?: () => void;
}): JSX.Element {
  const cost = (costMillicentsToday / 100_000).toFixed(5);
  const body = (
    <>
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
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="glass flex h-full w-full cursor-pointer flex-col justify-between p-3 text-left text-[var(--fg)] transition-colors hover:bg-[var(--glass-hover)]"
      >
        {body}
      </button>
    );
  }

  return (
    <div className="glass flex h-full flex-col justify-between p-3 text-[var(--fg)]">{body}</div>
  );
}
