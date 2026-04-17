import type { JSX } from 'react';
import { type Insight, useInsights } from '../../hooks/useVisibility';

export function Insights(): JSX.Element {
  const q = useInsights();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Insights</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        Learnings produced by the Analytics Analyst, read by the Strategist on the next run.
      </p>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No insights yet. Analytics Analyst writes an insight after each metrics window.
        </div>
      )}

      {q.data && (
        <div className="space-y-3">
          {q.data.map((i) => (
            <InsightCard key={i.id} i={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCard({ i }: { i: Insight }): JSX.Element {
  const window = i.metricsWindow as { from?: string; to?: string } | null;
  return (
    <div className="glass p-4">
      <div className="flex items-center justify-between gap-3 text-xs text-[var(--fg-subtle)]">
        <span>{new Date(i.generatedAt).toLocaleString()}</span>
        {window?.from && window?.to && (
          <span>
            window: {new Date(window.from).toLocaleDateString()} –{' '}
            {new Date(window.to).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="mt-2 whitespace-pre-wrap text-sm">{i.body}</div>
    </div>
  );
}
