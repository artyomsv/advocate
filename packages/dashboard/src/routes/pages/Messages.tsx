import { type JSX, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../../auth/useApiToken';
import { api } from '../../lib/api';

interface AgentMessage {
  id: string;
  fromAgent: string;
  toAgent: string;
  type: 'request' | 'response' | 'notification' | 'escalation';
  subject: string;
  content: string;
  replyTo: string | null;
  taskId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

const AGENT_NAME: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'Campaign Lead',
  '00000000-0000-4000-a000-000000000002': 'Strategist',
  '00000000-0000-4000-a000-000000000003': 'Content Writer',
  '00000000-0000-4000-a000-000000000004': 'Quality Gate',
  '00000000-0000-4000-a000-000000000005': 'Safety Worker',
  '00000000-0000-4000-a000-000000000006': 'Scout',
  '00000000-0000-4000-a000-000000000007': 'Analytics Analyst',
};

const AGENT_FILTERS = [
  { id: 'all', label: 'all' },
  { id: 'campaign-lead', label: 'Campaign Lead' },
  { id: 'strategist', label: 'Strategist' },
  { id: 'content-writer', label: 'Content Writer' },
  { id: 'quality-gate', label: 'Quality Gate' },
  { id: 'safety-worker', label: 'Safety Worker' },
  { id: 'scout', label: 'Scout' },
  { id: 'analytics-analyst', label: 'Analytics Analyst' },
] as const;

const TYPE_TONE: Record<AgentMessage['type'], string> = {
  request: 'bg-sky-500/15 text-sky-400',
  response: 'bg-emerald-500/15 text-emerald-400',
  notification: 'bg-[var(--glass-border)] text-[var(--fg-subtle)]',
  escalation: 'bg-amber-500/15 text-amber-400',
};

export function MessagesPage(): JSX.Element {
  const token = useApiToken();
  const [fromFilter, setFromFilter] = useState<string>('all');

  const q = useQuery({
    queryKey: ['messages', fromFilter],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (fromFilter !== 'all') qp.set('fromAgent', fromFilter);
      qp.set('sinceDays', '7');
      qp.set('limit', '200');
      return api<AgentMessage[]>(`/messages?${qp.toString()}`, { token });
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Agent messages</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Raw inter-agent communication log, last 7 days. Every orchestrator run emits
          Strategist → Writer → Gate → Safety → Lead.
        </p>
      </div>

      <div className="glass inline-flex flex-wrap gap-0.5 p-0.5">
        {AGENT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFromFilter(f.id)}
            className={
              fromFilter === f.id
                ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }
          >
            {f.label}
          </button>
        ))}
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No messages in the selected window.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="space-y-2">
          {q.data.map((m) => {
            const meta = m.metadata ?? {};
            const cost =
              typeof meta.costMillicents === 'number' ? meta.costMillicents : null;
            return (
              <div key={m.id} className="glass p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {AGENT_NAME[m.fromAgent] ?? m.fromAgent.slice(0, 8)}
                    </span>
                    <span className="text-[var(--fg-subtle)]">→</span>
                    <span className="text-sm">
                      {AGENT_NAME[m.toAgent] ?? m.toAgent.slice(0, 8)}
                    </span>
                    <span
                      className={`rounded px-2 py-0.5 text-[10px] font-medium ${TYPE_TONE[m.type]}`}
                    >
                      {m.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--fg-subtle)]">
                    {cost !== null && cost > 0 && (
                      <span>${(cost / 100_000).toFixed(5)}</span>
                    )}
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <div className="mt-1 text-sm font-medium">{m.subject}</div>
                <div className="mt-1 whitespace-pre-wrap rounded bg-[var(--glass-hover)] px-2 py-1 font-mono text-xs text-[var(--fg-muted)]">
                  {m.content.length > 500 ? `${m.content.slice(0, 500)}…` : m.content}
                </div>
                {m.taskId && (
                  <div className="mt-1 text-xs text-[var(--fg-subtle)]">
                    task <code>{m.taskId.slice(0, 8)}</code>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
