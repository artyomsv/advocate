import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import type { LegendAccount } from './useLegendAccounts';

export interface CreateAccountInput {
  legendId: string;
  platform: string;
  username: string;
  warmUpPhase?: 'lurking' | 'engaging' | 'established' | 'promoting';
  registeredAt?: string;
}

export function useCreateLegendAccount(legendId: string) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) =>
      api<LegendAccount>('/legend-accounts', {
        method: 'POST',
        token,
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legend-accounts', legendId] });
    },
  });
}
