import { ArrowUp, CheckCircle2, Circle, Clock, XCircle } from 'lucide-react';
import type { JSX } from 'react';
import { AgentsTabs } from '../../components/agents/AgentsTabs';
import { type AgentActivityItem, useAgentsActivity } from '../../hooks/useAgents';

export function AgentsActivity(): JSX.Element {
  const q = useAgentsActivity(20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Agents</h1>
        <AgentsTabs />
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}
      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No agent activity for the selected product yet. Trigger an orchestrator run or run{' '}
          <code className="text-[var(--color-accent)]">pnpm smoke:e2e</code>.
        </div>
      )}

      <div className="space-y-4">
        {(q.data ?? []).map((item) => (
          <ActivityCard key={item.contentPlanId} item={item} />
        ))}
      </div>

      <div className="text-xs text-[var(--fg-subtle)]">
        Runs after 2026-04-17 show the real inter-agent message log. Older runs
        fall back to a reconstruction from content_plans + llm_usage.
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }): JSX.Element {
  const common = 'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium';
  if (status === 'approved')
    return (
      <span className={`${common} bg-emerald-500/15 text-emerald-400`}>
        <CheckCircle2 size={12} /> approved
      </span>
    );
  if (status === 'rejected')
    return (
      <span className={`${common} bg-red-500/15 text-red-400`}>
        <XCircle size={12} /> rejected
      </span>
    );
  if (status === 'review')
    return (
      <span className={`${common} bg-[var(--accent-muted)] text-[var(--color-accent)]`}>
        <Clock size={12} /> review
      </span>
    );
  return (
    <span className={`${common} bg-[var(--glass-hover)] text-[var(--fg-muted)]`}>
      <Circle size={12} /> {status}
    </span>
  );
}

function ActivityCard({ item }: { item: AgentActivityItem }): JSX.Element {
  const cost = (item.totalCostMillicents / 100_000).toFixed(5);
  const ago = formatRelative(new Date(item.createdAt));

  return (
    <div className="glass overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-[var(--glass-border)] px-5 py-3">
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--fg-subtle)]">{ago}</span>
          <span className="text-sm">
            content_plan{' '}
            <code className="text-[var(--fg-muted)]">{item.contentPlanId.slice(0, 8)}</code>
          </span>
          <span className="text-xs text-[var(--fg-subtle)]">
            {item.contentType} · L{item.promotionLevel}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--fg-subtle)]">${cost}</span>
          <StatusBadge status={item.status} />
        </div>
      </div>

      <ol className="flex flex-col gap-0 px-5 py-3">
        {item.pipeline.map((step, i) => (
          <li key={i} className="flex items-start gap-3 py-1.5">
            {i > 0 && (
              <ArrowUp
                size={12}
                className="mt-[3px] shrink-0 text-[var(--fg-subtle)]"
              />
            )}
            {i === 0 && <span className="w-3 shrink-0" />}
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{step.agent}</span>
                {step.at && (
                  <span className="text-xs text-[var(--fg-subtle)]">
                    {new Date(step.at).toLocaleTimeString()}
                  </span>
                )}
                {step.model && (
                  <span className="text-xs text-[var(--fg-subtle)]">{step.model}</span>
                )}
                {typeof step.costMillicents === 'number' && step.costMillicents > 0 && (
                  <span className="text-xs text-[var(--fg-subtle)]">
                    ${(step.costMillicents / 100_000).toFixed(5)}
                  </span>
                )}
              </div>
              <div className="text-sm text-[var(--fg-muted)]">{step.summary}</div>
              {step.content && step.content !== step.summary && (
                <div className="mt-1 whitespace-pre-wrap rounded bg-[var(--glass-hover)] px-2 py-1 font-mono text-xs text-[var(--fg-subtle)]">
                  {step.content.length > 400
                    ? `${step.content.slice(0, 400)}…`
                    : step.content}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
