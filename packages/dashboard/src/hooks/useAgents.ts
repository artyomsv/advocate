import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export interface AgentStatus {
  agentId: string;
  name: string;
  role: string;
  status: 'ready' | 'running' | 'idle' | 'error';
  lastRunAt: string | null;
  runsToday: number;
  costMillicentsToday: number;
  providers: string[];
}

export interface AgentActivityStep {
  agent: string;
  summary: string;
  provider?: string;
  model?: string;
  costMillicents?: number;
}

export interface AgentActivityItem {
  contentPlanId: string;
  status: string;
  createdAt: string;
  promotionLevel: number;
  contentType: string;
  rejectionReason: string | null;
  pipeline: AgentActivityStep[];
  totalCostMillicents: number;
}

export function useAgentsStatus() {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['agents-status', productId],
    queryFn: () =>
      api<AgentStatus[]>(`/agents/status${productId ? `?productId=${productId}` : ''}`, {
        token,
      }),
    enabled: !!token,
    refetchInterval: 15_000,
  });
}

export function useAgentsActivity(limit = 20) {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['agents-activity', productId, limit],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('productId', productId);
      qp.set('limit', String(limit));
      return api<AgentActivityItem[]>(`/agents/activity?${qp.toString()}`, { token });
    },
    enabled: !!token,
  });
}
