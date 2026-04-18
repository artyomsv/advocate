import { Sparkles, Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Button } from '../../components/ui/button';
import {
  useDeleteLesson,
  useLessons,
  useTriggerConsolidate,
} from '../../hooks/useLessons';

const AGENT_NAME: Record<string, string> = {
  '00000000-0000-4000-a000-000000000001': 'Campaign Lead',
  '00000000-0000-4000-a000-000000000002': 'Strategist',
  '00000000-0000-4000-a000-000000000003': 'Content Writer',
  '00000000-0000-4000-a000-000000000004': 'Quality Gate',
  '00000000-0000-4000-a000-000000000006': 'Scout',
  '00000000-0000-4000-a000-000000000007': 'Analytics Analyst',
};

const AGENT_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'strategist', label: 'Strategist' },
  { id: 'content-writer', label: 'Content Writer' },
  { id: 'quality-gate', label: 'Quality Gate' },
  { id: 'campaign-lead', label: 'Campaign Lead' },
  { id: 'scout', label: 'Scout' },
  { id: 'analytics-analyst', label: 'Analytics Analyst' },
] as const;

export function Lessons(): JSX.Element {
  const [filter, setFilter] = useState<string>('all');
  const q = useLessons(filter === 'all' ? undefined : filter);
  const del = useDeleteLesson();
  const trigger = useTriggerConsolidate();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium">Lessons</h1>
          <p className="mt-1 text-sm text-[var(--fg-muted)]">
            Craft + community patterns the Memory Consolidator distilled from agent runs.
            Shared across all products by design — product-specific signals are filtered out.
            Delete any lesson that looks wrong.
          </p>
        </div>
        <Button
          size="sm"
          disabled={trigger.isPending}
          onClick={() => trigger.mutate()}
          title="Fires a manual consolidation run. The daily cron runs at 04:00 UTC."
        >
          <Sparkles size={14} />
          {trigger.isPending ? 'Running…' : 'Consolidate now'}
        </Button>
      </div>

      <div className="glass inline-flex flex-wrap gap-0.5 p-0.5">
        {AGENT_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={
              filter === f.id
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
          No lessons yet. The consolidator runs daily at 04:00 UTC, or click{' '}
          <strong>Consolidate now</strong> if at least 5 episodes exist for an agent in the
          last 24 hours.
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <div className="space-y-3">
          {q.data.map((l) => (
            <div key={l.id} className="glass p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">
                    {AGENT_NAME[l.agentId] ?? l.agentId.slice(0, 8)}
                  </div>
                  <div className="text-xs text-[var(--fg-subtle)]">
                    {new Date(l.periodFrom).toLocaleDateString()} –{' '}
                    {new Date(l.periodTo).toLocaleDateString()} · consolidated{' '}
                    {new Date(l.consolidatedAt).toLocaleString()} ·{' '}
                    {l.sourceEpisodeIds.length} source episode
                    {l.sourceEpisodeIds.length === 1 ? '' : 's'}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Delete this lesson? The orchestrator will stop injecting it into future runs.',
                      )
                    ) {
                      del.mutate(l.id);
                    }
                  }}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
              <div className="mt-2 text-sm">{l.summary}</div>
              <ul className="mt-2 space-y-1 text-sm text-[var(--fg-muted)]">
                {l.lessons.map((lesson, i) => (
                  <li key={i}>· {lesson}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
