import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface AgentRecentMessage {
  id: string;
  subject: string;
  content: string;
  toAgent: string;
  toAgentName: string;
  type: string;
  taskId: string | null;
  createdAt: string;
  costMillicents: number | null;
}

export interface AgentDetail {
  agentId: string;
  name: string;
  role: string;
  totalCostMillicentsToday: number;
  totalCostMillicentsMonth: number;
  runsMonth: number;
  recentMessages: AgentRecentMessage[];
}

export function useAgentDetail(agentId: string | null) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['agent-detail', agentId],
    queryFn: () => api<AgentDetail>(`/agents/${agentId}`, { token }),
    enabled: !!token && !!agentId,
  });
}
