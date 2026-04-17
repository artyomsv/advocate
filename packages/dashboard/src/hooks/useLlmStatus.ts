import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface LlmStatus {
  mode: string;
  monthlyBudgetCents: number;
  activeProviders: string[];
  routes: string[];
}

export function useLlmStatus() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['llm-status'],
    queryFn: () => api<LlmStatus>('/llm/status', { token }),
    enabled: !!token,
  });
}
