import { type JSX, useState } from 'react';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Drawer } from '../../components/ui/drawer';
import { Field } from '../../components/ui/field';
import { Textarea } from '../../components/ui/textarea';
import {
  type ContentPlan,
  type ContentPlanStatus,
  useContentPlanDecision,
  useContentPlanRevise,
  useContentPlans,
} from '../../hooks/useContentPlans';

export function ContentQueue(): JSX.Element {
  const [tab, setTab] = useState<ContentPlanStatus>('review');
  const q = useContentPlans(tab);
  const mutate = useContentPlanDecision();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revising, setRevising] = useState<ContentPlan | null>(null);

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
        <h1 className="text-2xl font-semibold">Content queue</h1>
        <Badge>{items.length}</Badge>
      </div>

      <div className="glass inline-flex gap-0.5 p-0.5">
        {(['review', 'rejected', 'approved', 'posted'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setSelected(new Set());
            }}
            className={
              tab === t
                ? 'rounded-[10px] bg-[var(--accent-muted)] px-3 py-1.5 text-sm text-[var(--color-accent)]'
                : 'rounded-[10px] px-3 py-1.5 text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]'
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'review' && items.length > 0 && (
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
            No content plans with status <code>{tab}</code>.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {items.map((p) => (
          <ContentPlanCard
            key={p.id}
            plan={p}
            tab={tab}
            checked={selected.has(p.id)}
            onToggle={() => toggle(p.id)}
            onDecide={(decision) => mutate.mutate({ id: p.id, decision })}
            onRevise={() => setRevising(p)}
            busy={mutate.isPending}
          />
        ))}
      </div>

      <ReviseDrawer plan={revising} onClose={() => setRevising(null)} />
    </div>
  );
}

function ContentPlanCard({
  plan,
  tab,
  checked,
  onToggle,
  onDecide,
  onRevise,
  busy,
}: {
  plan: ContentPlan;
  tab: ContentPlanStatus;
  checked: boolean;
  onToggle: () => void;
  onDecide: (d: 'approve' | 'reject') => void;
  onRevise: () => void;
  busy: boolean;
}): JSX.Element {
  const title = plan.threadContext?.slice(0, 120) ?? plan.contentType;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <label className="flex cursor-pointer items-start gap-3">
            {tab === 'review' && (
              <input
                type="checkbox"
                checked={checked}
                onChange={onToggle}
                className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
              />
            )}
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
        {plan.rejectionReason && (
          <div className="text-xs text-red-400">rejection: {plan.rejectionReason}</div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">
            scheduled {new Date(plan.scheduledAt).toLocaleString()}
          </span>
          <div className="flex gap-2">
            {tab === 'review' && (
              <>
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
              </>
            )}
            {tab === 'rejected' && (
              <Button size="sm" variant="outline" onClick={onRevise}>
                Revise & re-queue
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ReviseDrawer({
  plan,
  onClose,
}: { plan: ContentPlan | null; onClose: () => void }): JSX.Element {
  return (
    <Drawer
      open={!!plan}
      onOpenChange={(v) => !v && onClose()}
      title="Revise & re-queue"
      width="w-[560px]"
    >
      {plan && <ReviseForm plan={plan} onClose={onClose} />}
    </Drawer>
  );
}

function ReviseForm({ plan, onClose }: { plan: ContentPlan; onClose: () => void }): JSX.Element {
  const revise = useContentPlanRevise();
  const [content, setContent] = useState(plan.generatedContent ?? '');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await revise.mutateAsync({ id: plan.id, content: content.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-xs text-[var(--fg-subtle)]">
        Creates a new plan in review status with your edits. The original rejected plan stays
        in the audit trail.
      </div>
      {plan.rejectionReason && (
        <div className="rounded bg-red-500/10 p-2 text-xs text-red-400">
          Original rejection: {plan.rejectionReason}
        </div>
      )}
      <Field label="Content">
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          autoFocus
        />
      </Field>
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={revise.isPending || !content.trim()}>
          {revise.isPending ? 'Queuing…' : 'Queue for review'}
        </Button>
      </div>
    </form>
  );
}
