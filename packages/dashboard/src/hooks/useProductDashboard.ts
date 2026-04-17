import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface ProductDashboard {
  product: {
    id: string;
    name: string;
    slug: string;
    status: string;
    description: string;
    url: string | null;
    valueProps: string[];
    painPoints: string[];
    talkingPoints: string[];
    neverSay: string[] | null;
    targetAudiences: { segment: string; platforms: string[] }[] | null;
    competitorComparisons: { name: string; comparison: string }[] | null;
  };
  legendCount: number;
  activeAccountCount: number;
  queueCount: number;
  costMillicentsThisMonth: number;
}

export type ProductActivityItem =
  | {
      kind: 'content_plan';
      id: string;
      status: string;
      contentType: string;
      promotionLevel: number;
      createdAt: string;
    }
  | {
      kind: 'legend_created';
      id: string;
      firstName: string;
      lastName: string;
      createdAt: string;
    }
  | {
      kind: 'discovery';
      id: string;
      title: string;
      score: string;
      dispatched: boolean;
      createdAt: string;
    }
  | {
      kind: 'insight';
      id: string;
      body: string;
      createdAt: string;
    };

export function useProductDashboard(productId: string | null) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['product-dashboard', productId],
    queryFn: () => api<ProductDashboard>(`/products/${productId}/dashboard`, { token }),
    enabled: !!token && !!productId,
  });
}

export function useProductActivity(productId: string | null, limit = 20) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['product-activity', productId, limit],
    queryFn: () =>
      api<ProductActivityItem[]>(`/products/${productId}/activity?limit=${limit}`, { token }),
    enabled: !!token && !!productId,
  });
}
