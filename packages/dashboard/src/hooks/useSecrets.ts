import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export type SecretCategory = 'reddit' | 'llm' | 'telegram';

export interface MaskedSecret {
  category: SecretCategory;
  key: string;
  masked: string;
  source: 'db' | 'env' | 'unset';
  updatedAt: string | null;
}

export function useSecrets(category: SecretCategory) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['secrets', category],
    queryFn: () => api<MaskedSecret[]>(`/secrets/${category}`, { token }),
    enabled: !!token,
  });
}

export function useSetSecret(category: SecretCategory) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) =>
      api<{ ok: true }>(`/secrets/${category}`, {
        method: 'PUT',
        token,
        body: JSON.stringify({ key, value }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', category] }),
  });
}

export function useDeleteSecret(category: SecretCategory) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      api<void>(`/secrets/${category}/${key}`, { method: 'DELETE', token }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secrets', category] }),
  });
}
