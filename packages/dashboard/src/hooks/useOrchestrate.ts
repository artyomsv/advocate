import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface DraftResult {
  contentPlan: { id: string; status: string };
  totalCostMillicents: number;
}

export function useOrchestrateDraft() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { productId: string; campaignGoal: string }) =>
      api<DraftResult>('/orchestrate/draft', {
        method: 'POST',
        token,
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['agents-activity'] });
      void qc.invalidateQueries({ queryKey: ['content-plans'] });
      void qc.invalidateQueries({ queryKey: ['product-activity'] });
      void qc.invalidateQueries({ queryKey: ['llm-spend'] });
    },
  });
}
