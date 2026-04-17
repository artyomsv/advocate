import type { JSX } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { type LlmSpendBucket, useLlmSpend } from '../../hooks/useLlmSpend';
import { useLlmStatus } from '../../hooks/useLlmStatus';

export function LlmCenter(): JSX.Element {
  const q = useLlmStatus();
  const spend = useLlmSpend();
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
          <CardTitle>Spend (this month)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {spend.isLoading && <div className="text-sm text-slate-400">Loading spend…</div>}
          {spend.isError && (
            <div className="text-sm text-red-400">
              Error: {(spend.error as Error).message}
            </div>
          )}
          {spend.data && (
            <>
              <div className="flex flex-wrap items-baseline gap-4">
                <span className="text-2xl font-semibold">
                  ${(spend.data.totalMillicents / 100_000).toFixed(4)}
                </span>
                <span className="text-sm text-slate-400">
                  of ${budgetDollars} budget · {spend.data.totalCalls} calls
                </span>
                <span className="text-xs text-slate-500">
                  since {new Date(spend.data.windowStart).toLocaleDateString()}
                </span>
              </div>

              {spend.data.totalCalls === 0 ? (
                <div className="text-sm text-slate-400">
                  No LLM calls recorded yet this month.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <SpendBarChart title="By provider" data={spend.data.byProvider} />
                  <SpendPieChart title="By task type" data={spend.data.byTaskType} />
                  <div className="lg:col-span-2">
                    <SpendBarChart title="By model" data={spend.data.byModel} />
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const PIE_COLORS = ['#60a5fa', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#22d3ee'];

function formatDollars(millicents: number): string {
  return `$${(millicents / 100_000).toFixed(4)}`;
}

function SpendBarChart({
  title,
  data,
}: { title: string; data: LlmSpendBucket[] }): JSX.Element {
  const rows = data.map((d) => ({ ...d, dollars: d.costMillicents / 100_000 }));
  return (
    <div>
      <div className="mb-2 text-sm text-slate-300">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} margin={{ left: 8, right: 8, top: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="key" stroke="#94a3b8" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="#94a3b8"
            tick={{ fontSize: 11 }}
            tickFormatter={(v) => `$${Number(v).toFixed(3)}`}
          />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
            formatter={(v) =>
              typeof v === 'number' ? formatDollars(v * 100_000) : String(v)
            }
          />
          <Bar dataKey="dollars" fill="#60a5fa" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SpendPieChart({
  title,
  data,
}: { title: string; data: LlmSpendBucket[] }): JSX.Element {
  const rows = data.map((d) => ({
    name: d.key,
    value: d.costMillicents,
    calls: d.calls,
  }));
  return (
    <div>
      <div className="mb-2 text-sm text-slate-300">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={(entry) => entry.name}
          >
            {rows.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155' }}
            formatter={(v) => (typeof v === 'number' ? formatDollars(v) : String(v))}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
