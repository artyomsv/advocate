import { type JSX, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  type ContentPlan,
  useContentPlanDecision,
  useContentPlans,
} from '../../hooks/useContentPlans';

export function ContentQueue(): JSX.Element {
  const q = useContentPlans('review');
  const mutate = useContentPlanDecision();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  function toggle(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(): void {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.id)));
  }

  async function bulk(decision: 'approve' | 'reject'): Promise<void> {
    // Sequential to avoid race conditions on the same item; Mynah queue is
    // small so the UX cost is negligible.
    for (const id of selected) {
      await mutate.mutateAsync({ id, decision });
    }
    setSelected(new Set());
  }

  const allSelected = items.length > 0 && selected.size === items.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <Badge>{items.length} pending</Badge>
      </div>

      {items.length > 0 && (
        <div className="glass flex items-center gap-3 px-4 py-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            <span className="text-[var(--fg-muted)]">
              {selected.size > 0 ? `${selected.size} selected` : 'select all'}
            </span>
          </label>
          <div className="ml-auto flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={selected.size === 0 || mutate.isPending}
              onClick={() => void bulk('reject')}
            >
              Reject selected
            </Button>
            <Button
              size="sm"
              disabled={selected.size === 0 || mutate.isPending}
              onClick={() => void bulk('approve')}
            >
              Approve selected
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-slate-400">
            No content plans awaiting review.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <ContentPlanCard
            key={p.id}
            plan={p}
            checked={selected.has(p.id)}
            onToggle={() => toggle(p.id)}
            onDecide={(decision) => mutate.mutate({ id: p.id, decision })}
            busy={mutate.isPending}
          />
        ))}
      </div>
    </div>
  );
}

function ContentPlanCard({
  plan,
  checked,
  onToggle,
  onDecide,
  busy,
}: {
  plan: ContentPlan;
  checked: boolean;
  onToggle: () => void;
  onDecide: (d: 'approve' | 'reject') => void;
  busy: boolean;
}): JSX.Element {
  const title = plan.threadContext?.slice(0, 120) ?? plan.contentType;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={checked}
              onChange={onToggle}
              className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
            />
            <CardTitle className="truncate">{title || '(no context)'}</CardTitle>
          </label>
          <div className="flex shrink-0 gap-2">
            <Badge>{plan.contentType}</Badge>
            <Badge tone="warn">L{plan.promotionLevel}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-sm text-slate-300">
          {plan.generatedContent ?? '(no generated content yet)'}
        </pre>
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            scheduled {new Date(plan.scheduledAt).toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onDecide('reject')}
            >
              Reject
            </Button>
            <Button size="sm" disabled={busy} onClick={() => onDecide('approve')}>
              Approve
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
