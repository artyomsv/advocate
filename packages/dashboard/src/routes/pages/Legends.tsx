import type { JSX } from 'react';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { useLegends } from '../../hooks/useLegends';

export function Legends(): JSX.Element {
  const q = useLegends();
  if (q.isLoading) return <div className="p-4 text-slate-400">Loading…</div>;
  if (q.isError) return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Legends</h1>
        <Badge>{items.length}</Badge>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-slate-400">No legends created yet.</CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((l) => (
          <Card key={l.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {l.firstName} {l.lastName}
                </CardTitle>
                <Badge tone="warn">{l.maturity}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <div>
                {l.professional.occupation} at {l.professional.company} · {l.age} · {l.gender}
              </div>
              <div className="text-xs text-slate-400">
                {l.location.city}, {l.location.country} · {l.location.timezone}
              </div>
              <div className="flex flex-wrap gap-1">
                {l.expertiseAreas.slice(0, 5).map((e) => (
                  <Badge key={e}>{e}</Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
