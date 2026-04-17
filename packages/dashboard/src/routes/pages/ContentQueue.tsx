import type { JSX } from 'react';
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

  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Review queue</h1>
        <Badge>{items.length} pending</Badge>
      </div>

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
  onDecide,
  busy,
}: {
  plan: ContentPlan;
  onDecide: (d: 'approve' | 'reject') => void;
  busy: boolean;
}): JSX.Element {
  const title = plan.threadContext?.slice(0, 120) ?? plan.contentType;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="truncate">{title || '(no context)'}</CardTitle>
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
