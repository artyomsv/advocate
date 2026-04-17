import { type JSX, useState } from 'react';
import { AgentsTabs } from '../../components/agents/AgentsTabs';
import { Button } from '../../components/ui/button';
import { Drawer } from '../../components/ui/drawer';
import { Field } from '../../components/ui/field';
import { Textarea } from '../../components/ui/textarea';
import {
  type AgentConfigEntry,
  useAgentConfig,
  useUpdateAgentSoul,
} from '../../hooks/useAgentConfig';

export function AgentsConfig(): JSX.Element {
  const q = useAgentConfig();
  const [editing, setEditing] = useState<AgentConfigEntry | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Agents</h1>
        <AgentsTabs />
      </div>

      <p className="text-sm text-[var(--fg-muted)]">
        System prompts (souls) and model routing for each agent. Click Edit on any
        non-dynamic agent to override its soul in the DB; changes take effect on the next
        call (30s cache TTL).
      </p>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}

      {q.data && (
        <>
          <div className="glass p-4">
            <div className="mb-2 text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
              Routing mode
            </div>
            <div className="text-sm">
              <span className="font-medium">{q.data.mode}</span>{' '}
              <span className="text-[var(--fg-subtle)]">·</span>{' '}
              <span className="text-[var(--fg-muted)]">
                active providers: {q.data.activeProviders.join(', ') || 'none'}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {q.data.agents.map((a) => {
              const route = a.taskType ? q.data.routes[a.taskType] : undefined;
              return (
                <div key={a.agentId} className="glass p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-base font-medium">{a.name}</div>
                      <div className="text-xs text-[var(--fg-subtle)]">{a.role}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.overridden && (
                        <span className="rounded bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                          overridden
                        </span>
                      )}
                      {a.dynamic ? (
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                          dynamic
                        </span>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => setEditing(a)}>
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <InfoBlock label="Task type" value={a.taskType ?? '—'} />
                    <InfoBlock
                      label="Primary model"
                      value={route ? `${route.primary.providerId} / ${route.primary.model}` : '—'}
                    />
                    <InfoBlock
                      label="Budget model"
                      value={route ? `${route.budget.providerId} / ${route.budget.model}` : '—'}
                    />
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 text-xs uppercase tracking-wide text-[var(--fg-subtle)]">
                      System prompt
                    </div>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded bg-[var(--glass-hover)] p-3 font-mono text-xs">
                      {a.systemPrompt}
                    </pre>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <EditSoulDrawer agent={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function EditSoulDrawer({
  agent,
  onClose,
}: { agent: AgentConfigEntry | null; onClose: () => void }): JSX.Element {
  return (
    <Drawer
      open={!!agent}
      onOpenChange={(v) => !v && onClose()}
      title={agent ? `Edit soul — ${agent.name}` : 'Edit soul'}
      width="w-[640px]"
    >
      {agent && <EditSoulForm key={agent.agentId} agent={agent} onClose={onClose} />}
    </Drawer>
  );
}

function EditSoulForm({
  agent,
  onClose,
}: { agent: AgentConfigEntry; onClose: () => void }): JSX.Element {
  const update = useUpdateAgentSoul();
  const [soul, setSoul] = useState(agent.systemPrompt);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    try {
      await update.mutateAsync({ agentId: agent.agentId, soul: soul.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="text-xs text-[var(--fg-subtle)]">
        Overrides the code default in the agents.soul column. Takes effect on the next LLM
        call (30-second cache TTL across the api + worker processes).
      </div>
      <Field label="System prompt">
        <Textarea
          value={soul}
          onChange={(e) => setSoul(e.target.value)}
          rows={20}
          autoFocus
          className="font-mono text-xs"
        />
      </Field>
      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-sm text-red-400">
          {error}
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending || !soul.trim()}>
          {update.isPending ? 'Saving…' : 'Save override'}
        </Button>
      </div>
    </form>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="rounded border border-[var(--glass-border)] p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--fg-subtle)]">{label}</div>
      <div className="mt-1 font-mono text-sm">{value}</div>
    </div>
  );
}
