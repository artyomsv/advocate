import { type JSX, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../../auth/useApiToken';
import { api } from '../../lib/api';

type EventType =
  | 'rate_limit_hit'
  | 'content_rejected'
  | 'account_warned'
  | 'account_suspended'
  | 'kill_switch_activated';

interface SafetyEvent {
  id: string;
  agentId: string | null;
  eventType: EventType;
  details: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
}

const TONE: Record<EventType, string> = {
  rate_limit_hit: 'bg-amber-500/15 text-amber-400',
  content_rejected: 'bg-red-500/15 text-red-400',
  account_warned: 'bg-amber-500/15 text-amber-400',
  account_suspended: 'bg-red-500/15 text-red-400',
  kill_switch_activated: 'bg-red-500/20 text-red-300',
};

export function SafetyEvents(): JSX.Element {
  const token = useApiToken();
  const [filter, setFilter] = useState<EventType | 'all'>('all');

  const q = useQuery({
    queryKey: ['safety-events', filter],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (filter !== 'all') qp.set('eventType', filter);
      qp.set('sinceDays', '30');
      return api<SafetyEvent[]>(`/safety-events?${qp.toString()}`, { token });
    },
    enabled: !!token,
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Safety events</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Rate-limit hits, content rejections, account warnings — last 30 days.
        </p>
      </div>

      <div className="glass inline-flex flex-wrap gap-0.5 p-0.5">
        {(['all', 'rate_limit_hit', 'content_rejected', 'account_warned', 'account_suspended', 'kill_switch_activated'] as const).map(
          (k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={
                filter === k
                  ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                  : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }
            >
              {k.replaceAll('_', ' ')}
            </button>
          ),
        )}
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No safety events logged.
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <div className="glass overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="px-4 py-2 text-left">When</th>
                <th className="px-4 py-2 text-left">Type</th>
                <th className="px-4 py-2 text-left">Notes</th>
                <th className="px-4 py-2 text-left">Details</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((ev) => (
                <tr key={ev.id} className="border-t border-[var(--glass-border)]">
                  <td className="px-4 py-2 text-xs text-[var(--fg-subtle)]">
                    {new Date(ev.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[ev.eventType]}`}>
                      {ev.eventType.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td className="max-w-sm px-4 py-2 text-[var(--fg-muted)]">{ev.notes ?? '—'}</td>
                  <td className="px-4 py-2">
                    {ev.details ? (
                      <code className="text-xs text-[var(--fg-subtle)]">
                        {JSON.stringify(ev.details)}
                      </code>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
