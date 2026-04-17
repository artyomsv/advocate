import type { JSX } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useLlmStatus } from '../../hooks/useLlmStatus';

export function LlmCenter(): JSX.Element {
  const q = useLlmStatus();
  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const s = q.data;
  if (!s) return <div className="p-4 text-slate-400">No status</div>;

  const budgetDollars = (s.monthlyBudgetCents / 100).toFixed(2);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">LLM Center</h1>

      <Card>
        <CardHeader>
          <CardTitle>Routing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Mode:</span>
            <Badge tone="success">{s.mode}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-slate-400">Monthly budget:</span>
            <Badge>${budgetDollars}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active providers</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {s.activeProviders.map((p) => (
              <Badge key={p} tone="success">
                {p}
              </Badge>
            ))}
            {s.activeProviders.length === 0 && (
              <span className="text-sm text-slate-400">
                None — all routes fall through to stub.
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registered routes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {s.routes.map((r) => (
              <Badge key={r}>{r}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-400">
          Per-call usage is not yet persisted. Will populate once Plan 11.5 (engine store
          persistence) lands.
        </CardContent>
      </Card>
    </div>
  );
}
