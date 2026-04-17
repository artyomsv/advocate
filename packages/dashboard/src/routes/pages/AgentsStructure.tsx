import type { JSX } from 'react';
import { AgentsTabs } from '../../components/agents/AgentsTabs';
import { OrgChart } from '../../components/agents/OrgChart';
import { useAgentsStatus } from '../../hooks/useAgents';

export function AgentsStructure(): JSX.Element {
  const q = useAgentsStatus();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">Agents</h1>
        <AgentsTabs />
      </div>

      {q.isLoading && <div className="text-[var(--fg-muted)]">Loading…</div>}
      {q.isError && <div className="text-red-400">Error: {(q.error as Error).message}</div>}
      {q.data && (
        <div className="glass p-4">
          <OrgChart agents={q.data} />
        </div>
      )}

      <div className="text-xs text-[var(--fg-subtle)]">
        Each node shows the agent's runs today and cost today. Click-through to detail lands
        once per-agent run records persist (Plan 11.5).
      </div>
    </div>
  );
}
