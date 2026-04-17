import { type JSX, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../../components/ui/dialog';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { type Campaign, useCampaigns, useCreateCampaign } from '../../hooks/useCampaigns';
import { useProductStore } from '../../stores/product.store';

export function Campaigns(): JSX.Element {
  const q = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Campaigns</h1>
        <Button onClick={() => setDialogOpen(true)}>New campaign</Button>
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && q.data.length === 0 && (
        <div className="glass p-6 text-[var(--fg-muted)]">
          No campaigns for this product yet.
        </div>
      )}

      {q.data && q.data.length > 0 && (
        <div className="glass overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="bg-[var(--glass-hover)] text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              <tr>
                <th className="px-4 py-2 text-left">Name</th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Legends</th>
                <th className="px-4 py-2 text-left">Communities</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <CampaignRow key={c.id} c={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function CampaignRow({ c }: { c: Campaign }): JSX.Element {
  return (
    <tr className="border-t border-[var(--glass-border)]">
      <td className="px-4 py-2 font-medium">{c.name}</td>
      <td className="px-4 py-2">
        <StatusChip status={c.status} />
      </td>
      <td className="px-4 py-2 text-[var(--fg-muted)]">{c.legendIds.length}</td>
      <td className="px-4 py-2 text-[var(--fg-muted)]">{c.communityIds.length}</td>
      <td className="px-4 py-2 text-[var(--fg-subtle)]">
        {new Date(c.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

function StatusChip({ status }: { status: Campaign['status'] }): JSX.Element {
  const color =
    status === 'active'
      ? 'bg-emerald-500/15 text-emerald-400'
      : status === 'planned'
        ? 'bg-sky-500/15 text-sky-400'
        : status === 'paused'
          ? 'bg-amber-500/15 text-amber-400'
          : 'bg-[var(--glass-border)] text-[var(--fg-subtle)]';
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${color}`}>
      {status}
    </span>
  );
}

function NewCampaignDialog({
  open,
  onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }): JSX.Element {
  const productId = useProductStore((s) => s.selectedProductId);
  const create = useCreateCampaign();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [strategy, setStrategy] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!productId) {
      setError('Select a product first');
      return;
    }
    setError(null);
    try {
      await create.mutateAsync({
        productId,
        name: name.trim(),
        description: description.trim() || undefined,
        strategy: strategy.trim() || undefined,
      });
      setName('');
      setDescription('');
      setStrategy('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="New campaign">
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="Description" hint="optional">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </Field>
            <Field label="Strategy" hint="optional — how this campaign differs from others">
              <Textarea
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
                rows={3}
              />
            </Field>
            {error && (
              <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending || !name.trim()}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
