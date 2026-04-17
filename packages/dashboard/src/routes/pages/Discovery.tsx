import { type JSX, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type Discovery,
  useDiscoveries,
  useDiscoveriesHistogram,
} from '../../hooks/useDiscoveries';

export function DiscoveryPage(): JSX.Element {
  const [minScore, setMinScore] = useState<number>(0);
  const [dispatched, setDispatched] = useState<'all' | 'dispatched' | 'skipped'>('all');

  const hist = useDiscoveriesHistogram(30);
  const list = useDiscoveries({
    minScore: minScore > 0 ? minScore : undefined,
    dispatched:
      dispatched === 'dispatched' ? 'true' : dispatched === 'skipped' ? 'false' : undefined,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Discovery</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Every thread Scout scored in the last 30 days. Tune your dispatch threshold by
          inspecting how score correlates with good drafts.
        </p>
      </div>

      <div className="glass p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
          Score histogram · last 30 days
        </div>
        {hist.isLoading && <div className="text-sm text-[var(--fg-muted)]">Loading…</div>}
        {hist.data && hist.data.length === 0 && (
          <div className="text-sm text-[var(--fg-muted)]">
            No discoveries yet. Scout runs via cron — or trigger the Scout worker manually.
          </div>
        )}
        {hist.data && hist.data.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={hist.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis
                dataKey="bucket"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                tickFormatter={(v) => `${v}–${v + 1}`}
              />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" stackId="a" fill="#475569" name="skipped" />
              <Bar dataKey="dispatched" stackId="b" fill="#60a5fa" name="dispatched" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="glass flex flex-wrap items-center gap-3 p-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-[var(--fg-muted)]">Min score</span>
          <input
            type="range"
            min={0}
            max={10}
            step={1}
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            className="w-36"
          />
          <span className="w-6 font-mono text-[var(--fg)]">{minScore}</span>
        </label>

        <div className="ml-auto glass inline-flex gap-0.5 p-0.5">
          {(['all', 'dispatched', 'skipped'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setDispatched(k)}
              className={
                dispatched === k
                  ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                  : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      {list.isLoading && <div className="text-[var(--fg-muted)]">Loading discoveries…</div>}
      {list.data && list.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No discoveries matching these filters.
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <div className="glass overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="w-16 px-4 py-2 text-right">Score</th>
                <th className="px-4 py-2 text-left">Thread</th>
                <th className="px-4 py-2 text-left">Author</th>
                <th className="px-4 py-2 text-left">State</th>
                <th className="px-4 py-2 text-left">Scanned</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((d) => (
                <DiscoveryRow key={d.id} d={d} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DiscoveryRow({ d }: { d: Discovery }): JSX.Element {
  const score = Number(d.score);
  const tone =
    score >= 8
      ? 'text-emerald-400'
      : score >= 5
        ? 'text-amber-400'
        : 'text-[var(--fg-subtle)]';
  return (
    <tr className="border-t border-[var(--glass-border)]">
      <td className={`px-4 py-2 text-right font-mono ${tone}`}>{score.toFixed(1)}</td>
      <td className="px-4 py-2">
        {d.url ? (
          <a
            href={d.url}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--color-accent)]"
          >
            {d.title}
          </a>
        ) : (
          <span>{d.title}</span>
        )}
        {d.snippet && (
          <div className="mt-1 line-clamp-2 text-xs text-[var(--fg-subtle)]">{d.snippet}</div>
        )}
      </td>
      <td className="px-4 py-2 text-[var(--fg-muted)]">{d.author ?? '—'}</td>
      <td className="px-4 py-2">
        {d.dispatched ? (
          <span className="rounded bg-[var(--accent-muted)] px-2 py-0.5 text-xs text-[var(--color-accent)]">
            dispatched
          </span>
        ) : (
          <span className="text-xs text-[var(--fg-subtle)]">skipped</span>
        )}
      </td>
      <td className="px-4 py-2 text-xs text-[var(--fg-subtle)]">
        {new Date(d.scannedAt).toLocaleString()}
      </td>
    </tr>
  );
}
