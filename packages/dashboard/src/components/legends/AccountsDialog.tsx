import { type JSX, useState } from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { useCreateLegendAccount } from '../../hooks/useLegendAccountMutations';
import { useLegendAccounts } from '../../hooks/useLegendAccounts';

const PLATFORMS = ['reddit', 'twitter', 'facebook', 'instagram', 'tiktok'] as const;

export function AccountsDialog({
  open,
  onOpenChange,
  legendId,
  legendName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  legendId: string;
  legendName: string;
}): JSX.Element {
  const accounts = useLegendAccounts(legendId);
  const create = useCreateLegendAccount(legendId);
  const [platform, setPlatform] = useState<string>('reddit');
  const [username, setUsername] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const add = async (): Promise<void> => {
    if (!username.trim()) {
      setErr('Username is required');
      return;
    }
    try {
      setErr(null);
      await create.mutateAsync({
        legendId,
        platform,
        username: username.trim(),
      });
      setUsername('');
    } catch (ex) {
      setErr((ex as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Accounts — ${legendName}`}>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs uppercase tracking-wider text-[var(--fg-muted)]">
              Existing
            </div>
            {accounts.isLoading ? (
              <div className="text-sm text-[var(--fg-muted)]">Loading…</div>
            ) : (accounts.data ?? []).length === 0 ? (
              <div className="text-sm text-[var(--fg-subtle)]">
                No accounts yet — add one below.
              </div>
            ) : (
              <ul className="space-y-2">
                {(accounts.data ?? []).map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between rounded border border-[var(--glass-border)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{a.platform}</span>
                      <span className="mx-2 text-[var(--fg-subtle)]">·</span>
                      <code className="text-[var(--fg-muted)]">{a.username}</code>
                    </span>
                    <Badge tone={a.status === 'active' ? 'success' : 'default'}>
                      {a.warmUpPhase}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--glass-border)] pt-4">
            <div className="mb-3 text-xs uppercase tracking-wider text-[var(--fg-muted)]">
              Add account
            </div>
            <div className="space-y-3">
              <Field label="Platform">
                <select
                  className="h-9 w-full rounded border border-[var(--glass-border)] bg-transparent px-3 text-sm outline-none focus:border-[var(--color-accent)]"
                  value={platform}
                  onChange={(e) => setPlatform(e.target.value)}
                >
                  {PLATFORMS.map((p) => (
                    <option key={p} value={p} className="bg-[var(--bg-elevated)]">
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Username">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. sarah_mitchell"
                />
              </Field>
              {err && <div className="text-sm text-red-400">{err}</div>}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={() => void add()} disabled={create.isPending}>
            {create.isPending ? 'Adding…' : 'Add account'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
