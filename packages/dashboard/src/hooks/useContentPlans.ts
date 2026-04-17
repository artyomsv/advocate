import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export type ContentPlanStatus =
  | 'planned'
  | 'generating'
  | 'review'
  | 'approved'
  | 'rejected'
  | 'posted'
  | 'failed';

export interface ContentPlan {
  id: string;
  campaignId: string | null;
  legendId: string;
  legendAccountId: string | null;
  communityId: string;
  contentType: string;
  promotionLevel: number;
  threadUrl: string | null;
  threadContext: string | null;
  scheduledAt: string;
  status: ContentPlanStatus;
  generatedContent: string | null;
  qualityScore: unknown;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
}

export function useContentPlans(status: ContentPlanStatus = 'review') {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['content-plans', status, productId],
    queryFn: () =>
      api<ContentPlan[]>(
        `/content-plans?status=${status}${productId ? `&productId=${productId}` : ''}`,
        { token },
      ),
    enabled: !!token && !!productId,
  });
}

export function useContentPlanDecision() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'approve' | 'reject' }) =>
      api<ContentPlan>(`/content-plans/${id}/${decision}`, {
        method: 'POST',
        token,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content-plans'] });
    },
  });
}

export function useContentPlanRevise() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api<ContentPlan>(`/content-plans/${id}/revise`, {
        method: 'POST',
        token,
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['content-plans'] });
    },
  });
}
