import { CheckCircle2, Globe, Plus } from 'lucide-react';
import { type JSX, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { type LegendAccount, useLegendAccounts } from '../../hooks/useLegendAccounts';
import { type Legend, useLegends } from '../../hooks/useLegends';

export function Legends(): JSX.Element {
  const q = useLegends();
  const [params, setParams] = useSearchParams();
  const connected = params.get('reddit') === 'connected';
  const connectedAccountId = params.get('account');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (connected && !dismissed) {
      const t = setTimeout(() => {
        setDismissed(true);
        setParams({}, { replace: true });
      }, 4000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [connected, dismissed, setParams]);

  if (q.isLoading) return <div className="p-4 text-[var(--fg-muted)]">Loading…</div>;
  if (q.isError)
    return <div className="p-4 text-red-400">Error: {(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="space-y-4">
      {connected && !dismissed && (
        <div className="glass flex items-center gap-3 px-4 py-3 text-sm">
          <CheckCircle2 size={16} className="text-emerald-400" />
          <span>
            Reddit connected for account{' '}
            <code className="text-[var(--fg-muted)]">{connectedAccountId?.slice(0, 8)}</code>.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-medium">Legends</h1>
          <Badge>{items.length}</Badge>
        </div>
        <Button asChild>
          <Link to="/legends/new">
            <Plus size={14} />
            New legend
          </Link>
        </Button>
      </div>

      {items.length === 0 && (
        <Card>
          <CardContent className="p-6 text-[var(--fg-muted)]">
            No legends created yet.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((l) => (
          <LegendCard key={l.id} legend={l} />
        ))}
      </div>
    </div>
  );
}

function LegendCard({ legend }: { legend: Legend }): JSX.Element {
  const accounts = useLegendAccounts(legend.id);
  const redditAccount = (accounts.data ?? []).find((a) => a.platform === 'reddit');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>
            {legend.firstName} {legend.lastName}
          </CardTitle>
          <Badge tone="warn">{legend.maturity}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-[var(--fg)]">
        <div className="text-[var(--fg-muted)]">
          {legend.professional.occupation} at {legend.professional.company} · {legend.age} ·{' '}
          {legend.gender}
        </div>
        <div className="text-xs text-[var(--fg-subtle)]">
          {legend.location.city}, {legend.location.country} · {legend.location.timezone}
        </div>
        <div className="flex flex-wrap gap-1">
          {legend.expertiseAreas.slice(0, 5).map((e) => (
            <Badge key={e}>{e}</Badge>
          ))}
        </div>
        <RedditAccountBlock account={redditAccount} />
      </CardContent>
    </Card>
  );
}

function RedditAccountBlock({ account }: { account: LegendAccount | undefined }): JSX.Element {
  if (!account) {
    return (
      <div className="flex items-center gap-2 rounded border border-dashed border-[var(--glass-border)] px-3 py-2 text-xs text-[var(--fg-subtle)]">
        <Globe size={14} />
        <span>No Reddit account — create via API before connecting</span>
      </div>
    );
  }
  const apiBase = import.meta.env.VITE_API_BASE_URL;
  return (
    <div className="flex items-center justify-between gap-2 rounded border border-[var(--glass-border)] px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <Globe size={14} className="text-[var(--color-accent)]" />
        <span className="font-medium">u/{account.username}</span>
        <Badge tone={account.status === 'active' ? 'success' : 'default'}>{account.status}</Badge>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          window.location.href = `${apiBase}/oauth/reddit/authorize?legendAccountId=${account.id}`;
        }}
      >
        Connect Reddit
      </Button>
    </div>
  );
}
