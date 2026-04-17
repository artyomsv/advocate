import type { JSX } from 'react';
import { AgentsTabs } from '../../components/agents/AgentsTabs';
import { useAgentConfig } from '../../hooks/useAgentConfig';

export function AgentsConfig(): JSX.Element {
  const q = useAgentConfig();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Agents</h1>
        <AgentsTabs />
      </div>

      <p className="text-sm text-[var(--fg-muted)]">
        System prompts (souls) and model routing for each agent. Read-only — editing requires
        a code change; a DB-driven editor will arrive with the soul-in-DB refactor.
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
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-base font-medium">{a.name}</div>
                      <div className="text-xs text-[var(--fg-subtle)]">{a.role}</div>
                    </div>
                    {a.dynamic && (
                      <span className="rounded bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">
                        dynamic
                      </span>
                    )}
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
    </div>
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
