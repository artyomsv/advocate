import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import type { Legend } from './useLegends';

export function useCreateLegend() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api<Legend>('/legends', {
        method: 'POST',
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legends'] });
    },
  });
}

export function useUpdateLegend(legendId: string) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) =>
      api<Legend>(`/legends/${legendId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['legends'] });
    },
  });
}
