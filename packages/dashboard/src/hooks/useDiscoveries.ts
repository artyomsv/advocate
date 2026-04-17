import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export interface Discovery {
  id: string;
  productId: string;
  communityId: string;
  platformThreadId: string;
  url: string | null;
  title: string;
  author: string | null;
  snippet: string | null;
  score: string;
  dispatched: boolean;
  dispatchReason: string | null;
  scannedAt: string;
}

export interface HistogramBucket {
  bucket: number;
  total: number;
  dispatched: number;
}

export interface DiscoveryFilters {
  minScore?: number;
  dispatched?: 'true' | 'false';
  communityId?: string;
  sinceDays?: number;
}

export function useDiscoveries(filters: DiscoveryFilters = {}) {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['discoveries', productId, filters],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('productId', productId);
      if (filters.minScore !== undefined) qp.set('minScore', String(filters.minScore));
      if (filters.dispatched) qp.set('dispatched', filters.dispatched);
      if (filters.communityId) qp.set('communityId', filters.communityId);
      if (filters.sinceDays) qp.set('sinceDays', String(filters.sinceDays));
      return api<Discovery[]>(`/discoveries?${qp.toString()}`, { token });
    },
    enabled: !!token,
  });
}

export function useDiscoveriesHistogram(sinceDays = 30) {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['discoveries-histogram', productId, sinceDays],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('productId', productId);
      qp.set('sinceDays', String(sinceDays));
      return api<HistogramBucket[]>(`/discoveries/histogram?${qp.toString()}`, { token });
    },
    enabled: !!token,
  });
}
