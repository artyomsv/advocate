import { CheckCircle2, FileText, Pencil, Play, UserCircle2, X } from 'lucide-react';
import { type JSX, useState } from 'react';
import { EditBriefDrawer } from '../../components/products/EditBriefDrawer';
import { Button } from '../../components/ui/button';
import { useOrchestrateDraft } from '../../hooks/useOrchestrate';
import {
  type ProductActivityItem,
  useProductActivity,
  useProductDashboard,
} from '../../hooks/useProductDashboard';
import { useProductStore } from '../../stores/product.store';

export function ProductHome(): JSX.Element {
  const productId = useProductStore((s) => s.selectedProductId);
  const dash = useProductDashboard(productId);
  const activity = useProductActivity(productId, 12);
  const draft = useOrchestrateDraft();
  const [editOpen, setEditOpen] = useState(false);
  const [draftMsg, setDraftMsg] = useState<string | null>(null);

  if (!productId) {
    return (
      <div className="glass p-8 text-[var(--fg-muted)]">
        Select a product from the top bar to see its dashboard.
      </div>
    );
  }

  if (dash.isLoading) return <div className="p-4 text-[var(--fg-muted)]">Loading…</div>;
  if (dash.isError)
    return <div className="p-4 text-red-400">Error: {(dash.error as Error).message}</div>;
  if (!dash.data) return <div className="p-4 text-[var(--fg-muted)]">No data</div>;

  const d = dash.data;
  const cost = (d.costMillicentsThisMonth / 100_000).toFixed(5);

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-medium">{d.product.name}</h1>
          <div className="mt-1 text-sm text-[var(--fg-muted)]">
            {d.product.url ? (
              <a
                href={d.product.url}
                className="hover:text-[var(--color-accent)]"
                target="_blank"
                rel="noreferrer"
              >
                {d.product.url}
              </a>
            ) : (
              <span>no url</span>
            )}
            <span className="mx-2 text-[var(--fg-subtle)]">·</span>
            <span className="capitalize">{d.product.status}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            size="sm"
            disabled={draft.isPending}
            onClick={async () => {
              setDraftMsg(null);
              try {
                const result = await draft.mutateAsync({
                  productId,
                  campaignGoal: `Manual draft for ${d.product.name}`,
                });
                setDraftMsg(
                  `Drafted plan ${result.contentPlan.id.slice(0, 8)} (${result.contentPlan.status})`,
                );
              } catch (err) {
                setDraftMsg(
                  `Error: ${err instanceof Error ? err.message : 'failed'}`,
                );
              }
            }}
          >
            <Play size={14} />
            {draft.isPending ? 'Drafting…' : 'Run draft now'}
          </Button>
          {draftMsg && (
            <div
              className={
                draftMsg.startsWith('Error')
                  ? 'text-xs text-red-400'
                  : 'text-xs text-emerald-400'
              }
            >
              {draftMsg}
            </div>
          )}
        </div>
      </header>

      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCardSimple label="Legends" value={d.legendCount} hint="active personas" />
        <MetricCardSimple label="Queue" value={d.queueCount} hint="awaiting review" />
        <MetricCardSimple
          label="Accounts"
          value={d.activeAccountCount}
          hint="active social accounts"
        />
        <MetricCardSimple label="Cost" value={`$${cost}`} hint="this month" />
      </div>

      {/* Knowledge brief */}
      <div className="glass p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-medium">Knowledge brief</h2>
            <p className="mt-1 text-sm text-[var(--fg-muted)]">
              What agents know about this product.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil size={14} />
            Edit brief
          </Button>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <BriefSection title="Value props" items={d.product.valueProps} />
          <BriefSection title="Pain points" items={d.product.painPoints} />
          <BriefSection title="Talking points" items={d.product.talkingPoints} />
          <BriefSection
            title="Never say"
            items={d.product.neverSay ?? []}
            variant="neverSay"
          />
        </div>

        {d.product.targetAudiences && d.product.targetAudiences.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-sm font-medium text-[var(--fg)]">Target audiences</div>
            <ul className="space-y-1 text-sm text-[var(--fg-muted)]">
              {d.product.targetAudiences.map((a, i) => (
                <li key={i}>
                  {a.segment}{' '}
                  <span className="text-[var(--fg-subtle)]">→ {a.platforms.join(', ')}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>

      <EditBriefDrawer open={editOpen} onOpenChange={setEditOpen} product={d.product} />

      {/* Activity feed */}
      <div className="glass p-6">
        <h2 className="text-lg font-medium">Recent activity</h2>
        {activity.isLoading ? (
          <div className="mt-3 text-sm text-[var(--fg-muted)]">Loading…</div>
        ) : (activity.data ?? []).length === 0 ? (
          <div className="mt-3 text-sm text-[var(--fg-muted)]">
            Nothing yet. Fire the orchestrator from the queue or run{' '}
            <code className="text-[var(--color-accent)]">pnpm smoke:e2e</code> to seed events.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {(activity.data ?? []).map((item) => (
              <ActivityRow key={`${item.kind}-${item.id}`} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function MetricCardSimple({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): JSX.Element {
  return (
    <div className="glass p-5">
      <div className="text-xs uppercase tracking-wider text-[var(--fg-muted)]">{label}</div>
      <div className="mt-1 text-3xl font-medium">{value}</div>
      {hint && <div className="mt-1 text-xs text-[var(--fg-subtle)]">{hint}</div>}
    </div>
  );
}

function BriefSection({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant?: 'neverSay';
}): JSX.Element {
  const Icon = variant === 'neverSay' ? X : CheckCircle2;
  const iconClass =
    variant === 'neverSay' ? 'text-red-400' : 'text-[var(--color-accent)]';
  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      {items.length === 0 ? (
        <div className="text-sm text-[var(--fg-subtle)]">— not set</div>
      ) : (
        <ul className="space-y-1 text-sm text-[var(--fg-muted)]">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2">
              <Icon size={14} className={`mt-[3px] shrink-0 ${iconClass}`} />
              <span>{it}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ActivityRow({ item }: { item: ProductActivityItem }): JSX.Element {
  const dt = new Date(item.createdAt);
  const ago = formatRelative(dt);

  if (item.kind === 'content_plan') {
    const tone =
      item.status === 'approved'
        ? 'text-emerald-400'
        : item.status === 'rejected'
          ? 'text-red-400'
          : item.status === 'review'
            ? 'text-[var(--color-accent)]'
            : 'text-[var(--fg-muted)]';
    return (
      <li className="flex items-center gap-3 text-sm">
        <FileText size={14} className="text-[var(--fg-subtle)]" />
        <span className="w-20 text-xs text-[var(--fg-subtle)]">{ago}</span>
        <span className="flex-1">
          content_plan <code className="text-[var(--fg-muted)]">{item.id.slice(0, 8)}</code>{' '}
          — {item.contentType} · L{item.promotionLevel}
        </span>
        <span className={`text-xs ${tone}`}>{item.status}</span>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 text-sm">
      <UserCircle2 size={14} className="text-[var(--fg-subtle)]" />
      <span className="w-20 text-xs text-[var(--fg-subtle)]">{ago}</span>
      <span className="flex-1">
        legend <strong className="font-medium">{item.firstName} {item.lastName}</strong> created
      </span>
    </li>
  );
}

function formatRelative(d: Date): string {
  const ms = Date.now() - d.getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return `${days}d ago`;
}
