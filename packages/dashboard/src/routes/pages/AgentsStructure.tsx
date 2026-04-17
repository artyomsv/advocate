import { type JSX, useState } from 'react';
import { AgentDetailDrawer } from '../../components/agents/AgentDetailDrawer';
import { AgentsTabs } from '../../components/agents/AgentsTabs';
import { OrgChart } from '../../components/agents/OrgChart';
import { useAgentsStatus } from '../../hooks/useAgents';

export function AgentsStructure(): JSX.Element {
  const q = useAgentsStatus();
  const [selected, setSelected] = useState<string | null>(null);

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
          <OrgChart agents={q.data} onSelectAgent={setSelected} />
        </div>
      )}

      <div className="text-xs text-[var(--fg-subtle)]">
        Click any agent to open a detail drawer with its recent utterances and spend.
      </div>

      <AgentDetailDrawer agentId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
