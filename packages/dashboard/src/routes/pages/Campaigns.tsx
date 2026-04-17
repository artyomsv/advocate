import { Trash2 } from 'lucide-react';
import { type JSX, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogFooter } from '../../components/ui/dialog';
import { Drawer } from '../../components/ui/drawer';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import {
  type Campaign,
  useCampaigns,
  useCreateCampaign,
  useDeleteCampaign,
  useUpdateCampaign,
} from '../../hooks/useCampaigns';
import { useLegends } from '../../hooks/useLegends';
import { useCommunities } from '../../hooks/useVisibility';
import { useProductStore } from '../../stores/product.store';

export function Campaigns(): JSX.Element {
  const q = useCampaigns();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

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
                <th className="px-4 py-2 text-right">Legends</th>
                <th className="px-4 py-2 text-right">Communities</th>
                <th className="px-4 py-2 text-right">Plans</th>
                <th className="px-4 py-2 text-right">Review</th>
                <th className="px-4 py-2 text-right">Posted</th>
                <th className="px-4 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((c) => (
                <CampaignRow key={c.id} c={c} onClick={() => setEditing(c)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <NewCampaignDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <EditCampaignDrawer campaign={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function CampaignRow({
  c,
  onClick,
}: { c: Campaign; onClick: () => void }): JSX.Element {
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer border-t border-[var(--glass-border)] hover:bg-[var(--glass-hover)]"
    >
      <td className="px-4 py-2 font-medium">{c.name}</td>
      <td className="px-4 py-2">
        <StatusChip status={c.status} />
      </td>
      <td className="px-4 py-2 text-right text-[var(--fg-muted)]">{c.legendIds.length}</td>
      <td className="px-4 py-2 text-right text-[var(--fg-muted)]">{c.communityIds.length}</td>
      <td className="px-4 py-2 text-right font-mono">{c.stats?.totalPlans ?? 0}</td>
      <td className="px-4 py-2 text-right font-mono text-amber-400">
        {c.stats?.reviewPlans ?? 0}
      </td>
      <td className="px-4 py-2 text-right font-mono text-emerald-400">
        {c.stats?.postedPlans ?? 0}
      </td>
      <td className="px-4 py-2 text-[var(--fg-subtle)]">
        {new Date(c.createdAt).toLocaleDateString()}
      </td>
    </tr>
  );
}

function EditCampaignDrawer({
  campaign,
  onClose,
}: { campaign: Campaign | null; onClose: () => void }): JSX.Element {
  return (
    <Drawer
      open={!!campaign}
      onOpenChange={(v) => !v && onClose()}
      title="Edit campaign"
      width="w-[560px]"
    >
      {campaign && <EditForm key={campaign.id} campaign={campaign} onClose={onClose} />}
    </Drawer>
  );
}

function EditForm({
  campaign,
  onClose,
}: { campaign: Campaign; onClose: () => void }): JSX.Element {
  const update = useUpdateCampaign(campaign.id);
  const remove = useDeleteCampaign();
  const legends = useLegends();
  const communities = useCommunities();
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description ?? '');
  const [strategy, setStrategy] = useState(campaign.strategy ?? '');
  const [status, setStatus] = useState<Campaign['status']>(campaign.status);
  const [legendIds, setLegendIds] = useState<string[]>([...campaign.legendIds]);
  const [communityIds, setCommunityIds] = useState<string[]>([...campaign.communityIds]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        strategy: strategy.trim() || undefined,
        status,
        legendIds,
        communityIds,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  async function handleDelete(): Promise<void> {
    if (!window.confirm(`Delete campaign "${campaign.name}"?`)) return;
    await remove.mutateAsync(campaign.id);
    onClose();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </Field>
      <Field label="Status">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Campaign['status'])}
          className="w-full rounded border border-[var(--glass-border)] bg-transparent px-3 py-2 text-sm text-[var(--fg)] outline-none hover:border-[var(--color-accent)]"
        >
          {(['planned', 'active', 'paused', 'completed'] as const).map((s) => (
            <option key={s} value={s} className="bg-[var(--bg-elevated)]">
              {s}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description">
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />
      </Field>
      <Field label="Strategy">
        <Textarea
          value={strategy}
          onChange={(e) => setStrategy(e.target.value)}
          rows={4}
        />
      </Field>
      <Field label="Legends" hint={`${legendIds.length} selected`}>
        <MultiSelect
          items={(legends.data ?? []).map((l) => ({
            id: l.id,
            label: `${l.firstName} ${l.lastName}`,
            sublabel: `${l.maturity} · ${l.professional.occupation}`,
          }))}
          selected={legendIds}
          onChange={setLegendIds}
          emptyLabel="No legends for this product."
        />
      </Field>
      <Field label="Communities" hint={`${communityIds.length} selected`}>
        <MultiSelect
          items={(communities.data ?? []).map((c) => ({
            id: c.id,
            label: c.name,
            sublabel: `${c.platform} · ${c.status}`,
          }))}
          selected={communityIds}
          onChange={setCommunityIds}
          emptyLabel="No communities discovered yet."
        />
      </Field>
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={remove.isPending}
          onClick={() => void handleDelete()}
        >
          <Trash2 size={14} />
          Delete
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </form>
  );
}

interface MultiSelectItem {
  id: string;
  label: string;
  sublabel?: string;
}

function MultiSelect({
  items,
  selected,
  onChange,
  emptyLabel,
}: {
  items: MultiSelectItem[];
  selected: string[];
  onChange: (ids: string[]) => void;
  emptyLabel: string;
}): JSX.Element {
  if (items.length === 0) {
    return (
      <div className="rounded border border-dashed border-[var(--glass-border)] p-3 text-xs text-[var(--fg-subtle)]">
        {emptyLabel}
      </div>
    );
  }

  function toggle(id: string): void {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  return (
    <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--glass-border)] p-2">
      {items.map((i) => (
        <label
          key={i.id}
          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-[var(--glass-hover)]"
        >
          <input
            type="checkbox"
            checked={selected.includes(i.id)}
            onChange={() => toggle(i.id)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>{i.label}</span>
          {i.sublabel && (
            <span className="ml-auto text-xs text-[var(--fg-subtle)]">{i.sublabel}</span>
          )}
        </label>
      ))}
    </div>
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
