import type { JSX } from 'react';
import { type Community, useCommunities } from '../../hooks/useVisibility';

export function Communities(): JSX.Element {
  const q = useCommunities();

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-medium">Communities</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        Communities discovered by the Scout agent, ranked by relevance. Scores are 0–10.
      </p>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No communities discovered yet. Scout runs via cron — or trigger the Scout worker
          manually.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="glass overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="px-4 py-2 text-left">Community</th>
                <th className="px-4 py-2 text-left">Platform</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-right">Relevance</th>
                <th className="px-4 py-2 text-right">Activity</th>
                <th className="px-4 py-2 text-right">Receptiveness</th>
                <th className="px-4 py-2 text-right">Mod risk</th>
                <th className="px-4 py-2 text-right">Subs</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <CommunityRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CommunityRow({ c }: { c: Community }): JSX.Element {
  return (
    <tr className="border-t border-[var(--glass-border)]">
      <td className="px-4 py-2">
        <div className="font-medium">{c.name}</div>
        <div className="text-xs text-[var(--fg-subtle)]">{c.identifier}</div>
      </td>
      <td className="px-4 py-2 text-[var(--fg-muted)]">{c.platform}</td>
      <td className="px-4 py-2 text-[var(--fg-muted)]">{c.status}</td>
      <td className="px-4 py-2 text-right font-mono">{fmt(c.relevanceScore)}</td>
      <td className="px-4 py-2 text-right font-mono">{fmt(c.activityScore)}</td>
      <td className="px-4 py-2 text-right font-mono">{fmt(c.receptivenessScore)}</td>
      <td className="px-4 py-2 text-right font-mono">{fmt(c.moderationRisk)}</td>
      <td className="px-4 py-2 text-right text-[var(--fg-muted)]">
        {c.subscriberCount?.toLocaleString() ?? '—'}
      </td>
    </tr>
  );
}

function fmt(s: string | null): string {
  if (s === null) return '—';
  const n = Number(s);
  return Number.isFinite(n) ? n.toFixed(1) : '—';
}
