import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export interface CampaignStats {
  totalPlans: number;
  reviewPlans: number;
  approvedPlans: number;
  postedPlans: number;
  rejectedPlans: number;
}

export interface Campaign {
  id: string;
  productId: string;
  name: string;
  description: string | null;
  strategy: string | null;
  legendIds: string[];
  communityIds: string[];
  startDate: string | null;
  endDate: string | null;
  status: 'planned' | 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
  stats?: CampaignStats;
}

export interface CreateCampaignInput {
  productId: string;
  name: string;
  description?: string;
  strategy?: string;
  legendIds?: string[];
  communityIds?: string[];
  status?: Campaign['status'];
}

export function useCampaigns() {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['campaigns', productId],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('productId', productId);
      return api<Campaign[]>(`/campaigns${qp.size ? `?${qp.toString()}` : ''}`, { token });
    },
    enabled: !!token,
  });
}

export function useCreateCampaign() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCampaignInput) =>
      api<Campaign>('/campaigns', {
        method: 'POST',
        token,
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useUpdateCampaign(id: string) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<CreateCampaignInput>) =>
      api<Campaign>(`/campaigns/${id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

export function useDeleteCampaign() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/campaigns/${id}`, {
        method: 'DELETE',
        token,
        parseJson: false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}
