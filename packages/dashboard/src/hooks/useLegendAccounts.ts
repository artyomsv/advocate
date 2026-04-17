import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface LegendAccount {
  id: string;
  legendId: string;
  platform: string;
  username: string;
  status: string;
  warmUpPhase: string;
  postsToday: number;
  postsThisWeek: number;
  lastPostAt: string | null;
}

export function useLegendAccounts(legendId: string | null) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['legend-accounts', legendId],
    queryFn: () =>
      api<LegendAccount[]>(`/legends/${legendId}/accounts`, { token }),
    enabled: !!token && !!legendId,
  });
}
