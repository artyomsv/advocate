import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface AgentConfigEntry {
  agentId: string;
  name: string;
  role: string;
  taskType: string | null;
  systemPrompt: string;
  dynamic: boolean;
}

export interface ModelChoice {
  providerId: string;
  model: string;
}

export interface ModelRoute {
  primary: ModelChoice;
  fallback: ModelChoice;
  budget: ModelChoice;
}

export interface AgentConfigResponse {
  mode: string;
  activeProviders: string[];
  routes: Record<string, ModelRoute>;
  agents: AgentConfigEntry[];
}

export function useAgentConfig() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['agents-config'],
    queryFn: () => api<AgentConfigResponse>('/agents/config', { token }),
    enabled: !!token,
  });
}
