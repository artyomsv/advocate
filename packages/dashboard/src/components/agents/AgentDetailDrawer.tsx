import type { JSX } from 'react';
import { useAgentDetail } from '../../hooks/useAgentDetail';
import { Drawer } from '../ui/drawer';

export function AgentDetailDrawer({
  agentId,
  onClose,
}: {
  agentId: string | null;
  onClose: () => void;
}): JSX.Element {
  const q = useAgentDetail(agentId);

  return (
    <Drawer open={!!agentId} onOpenChange={(v) => !v && onClose()} title={q.data?.name ?? 'Agent'}>
      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && (
        <div className="text-red-400">Error: {(q.error as Error).message}</div>
      )}
      {q.data && (
        <div className="space-y-5">
          <div>
            <div className="text-xs text-[var(--fg-subtle)]">ROLE</div>
            <div className="text-sm text-[var(--fg-muted)]">{q.data.role}</div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Stat label="Runs (month)" value={String(q.data.runsMonth)} />
            <Stat
              label="Cost today"
              value={`$${(q.data.totalCostMillicentsToday / 100_000).toFixed(5)}`}
            />
            <Stat
              label="Cost month"
              value={`$${(q.data.totalCostMillicentsMonth / 100_000).toFixed(5)}`}
            />
          </div>

          <div>
            <div className="mb-2 text-xs text-[var(--fg-subtle)]">RECENT MESSAGES</div>
            {q.data.recentMessages.length === 0 ? (
              <div className="text-sm text-[var(--fg-muted)]">No messages sent yet.</div>
            ) : (
              <ol className="space-y-3">
                {q.data.recentMessages.map((m) => (
                  <li
                    key={m.id}
                    className="rounded border border-[var(--glass-border)] bg-[var(--glass-hover)] p-3"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium">{m.subject}</span>
                      <span className="text-xs text-[var(--fg-subtle)]">
                        {new Date(m.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--fg-subtle)]">
                      → {m.toAgentName} · {m.type}
                      {typeof m.costMillicents === 'number' && m.costMillicents > 0 && (
                        <span> · ${(m.costMillicents / 100_000).toFixed(5)}</span>
                      )}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap font-mono text-xs text-[var(--fg-muted)]">
                      {m.content.length > 400 ? `${m.content.slice(0, 400)}…` : m.content}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Stat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-[var(--glass-border)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--fg-subtle)]">{label}</div>
      <div className="text-base font-medium">{value}</div>
    </div>
  );
}
