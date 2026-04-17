import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface LlmSpendBucket {
  key: string;
  costMillicents: number;
  calls: number;
}

export interface LlmSpendSummary {
  windowStart: string;
  byProvider: LlmSpendBucket[];
  byTaskType: LlmSpendBucket[];
  byModel: LlmSpendBucket[];
  totalMillicents: number;
  totalCalls: number;
}

export function useLlmSpend() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['llm-spend'],
    queryFn: () => api<LlmSpendSummary>('/llm/spend', { token }),
    enabled: !!token,
    refetchInterval: 30_000,
  });
}
