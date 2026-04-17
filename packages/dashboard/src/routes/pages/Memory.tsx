import { type JSX, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../../auth/useApiToken';
import { api } from '../../lib/api';

interface EpisodicMemory {
  id: string;
  agentId: string;
  action: string;
  outcome: string;
  lesson: string | null;
  sentiment: 'positive' | 'neutral' | 'negative';
  context: Record<string, unknown> | null;
  createdAt: string;
}

interface ConsolidatedMemory {
  id: string;
  summary: string;
  lessons: string[];
  periodFrom: string;
  periodTo: string;
  consolidatedAt: string;
}

interface RelationalMemory {
  id: string;
  externalUsername: string;
  platform: string;
  context: string;
  sentiment: 'positive' | 'neutral' | 'negative';
  interactionCount: number;
  lastInteractionAt: string;
  notes: string | null;
}

interface MemoryResponse {
  episodic: EpisodicMemory[];
  consolidated: ConsolidatedMemory[];
  relational: RelationalMemory[];
}

const AGENTS = [
  { id: 'strategist', name: 'Strategist' },
  { id: 'content-writer', name: 'Content Writer' },
  { id: 'quality-gate', name: 'Quality Gate' },
  { id: 'scout', name: 'Scout' },
  { id: 'analytics-analyst', name: 'Analytics Analyst' },
  { id: 'campaign-lead', name: 'Campaign Lead' },
  { id: 'safety-worker', name: 'Safety Worker' },
] as const;

const TONE: Record<'positive' | 'neutral' | 'negative', string> = {
  positive: 'text-emerald-400',
  neutral: 'text-[var(--fg-muted)]',
  negative: 'text-red-400',
};

export function MemoryPage(): JSX.Element {
  const token = useApiToken();
  const [agentId, setAgentId] = useState<string>(AGENTS[0].id);

  const q = useQuery({
    queryKey: ['memories', agentId],
    queryFn: () => api<MemoryResponse>(`/agents/${agentId}/memories`, { token }),
    enabled: !!token,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-medium">Agent memory</h1>
        <p className="mt-1 text-sm text-[var(--fg-muted)]">
          Episodic + consolidated + relational memory per agent. Populated by the memory
          store wiring; most agents don't write yet, so expect empty state until that lands.
        </p>
      </div>

      <div className="glass inline-flex flex-wrap gap-0.5 p-0.5">
        {AGENTS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAgentId(a.id)}
            className={
              agentId === a.id
                ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }
          >
            {a.name}
          </button>
        ))}
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.data && (
        <div className="space-y-6">
          <Section
            title="Episodic"
            subtitle="raw events, last 50"
            empty="No episodic memories yet."
            count={q.data.episodic.length}
          >
            {q.data.episodic.map((m) => (
              <div key={m.id} className="glass p-3">
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className={TONE[m.sentiment]}>{m.sentiment}</span>
                  <span className="text-[var(--fg-subtle)]">
                    {new Date(m.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-sm font-medium">{m.action}</div>
                <div className="text-sm text-[var(--fg-muted)]">{m.outcome}</div>
                {m.lesson && (
                  <div className="mt-1 text-xs italic text-[var(--fg-subtle)]">
                    lesson: {m.lesson}
                  </div>
                )}
              </div>
            ))}
          </Section>

          <Section
            title="Consolidated"
            subtitle="LLM-compressed summaries of older episodes"
            empty="No consolidations yet."
            count={q.data.consolidated.length}
          >
            {q.data.consolidated.map((m) => (
              <div key={m.id} className="glass p-3">
                <div className="text-xs text-[var(--fg-subtle)]">
                  {new Date(m.periodFrom).toLocaleDateString()} –{' '}
                  {new Date(m.periodTo).toLocaleDateString()} · consolidated{' '}
                  {new Date(m.consolidatedAt).toLocaleDateString()}
                </div>
                <div className="mt-1 whitespace-pre-wrap text-sm">{m.summary}</div>
                {m.lessons.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-xs text-[var(--fg-muted)]">
                    {m.lessons.map((l, i) => (
                      <li key={i}>· {l}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </Section>

          <Section
            title="Relational"
            subtitle="external users this agent has interacted with"
            empty="No relational memories yet."
            count={q.data.relational.length}
          >
            <div className="glass overflow-hidden p-0">
              <table className="w-full text-sm">
                <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                  <tr>
                    <th className="px-4 py-2 text-left">User</th>
                    <th className="px-4 py-2 text-left">Platform</th>
                    <th className="px-4 py-2 text-left">Sentiment</th>
                    <th className="px-4 py-2 text-right">Interactions</th>
                    <th className="px-4 py-2 text-left">Last</th>
                    <th className="px-4 py-2 text-left">Context</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.relational.map((r) => (
                    <tr key={r.id} className="border-t border-[var(--glass-border)]">
                      <td className="px-4 py-2 font-medium">{r.externalUsername}</td>
                      <td className="px-4 py-2 text-[var(--fg-muted)]">{r.platform}</td>
                      <td className={`px-4 py-2 text-xs ${TONE[r.sentiment]}`}>{r.sentiment}</td>
                      <td className="px-4 py-2 text-right font-mono">{r.interactionCount}</td>
                      <td className="px-4 py-2 text-xs text-[var(--fg-subtle)]">
                        {new Date(r.lastInteractionAt).toLocaleString()}
                      </td>
                      <td className="max-w-sm truncate px-4 py-2 text-[var(--fg-muted)]">
                        {r.context}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  empty,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="text-lg font-medium">{title}</h2>
        <span className="text-xs text-[var(--fg-subtle)]">· {subtitle}</span>
        <span className="ml-auto text-xs text-[var(--fg-subtle)]">{count}</span>
      </div>
      {count === 0 ? (
        <div className="glass p-4 text-sm text-[var(--fg-muted)]">{empty}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}
