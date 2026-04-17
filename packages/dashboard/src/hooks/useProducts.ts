import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: 'draft' | 'active' | 'paused';
  url: string | null;
  valueProps: string[];
  painPoints: string[];
  talkingPoints: string[];
  neverSay: string[] | null;
  targetAudiences: { segment: string; platforms: string[] }[] | null;
  competitorComparisons: { name: string; comparison: string }[] | null;
  createdAt: string;
  updatedAt: string;
}

export function useProducts() {
  const token = useApiToken();
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products', { token }),
    enabled: !!token,
  });
}
