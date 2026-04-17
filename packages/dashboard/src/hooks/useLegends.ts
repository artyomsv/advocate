import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export interface Legend {
  id: string;
  productId: string;
  firstName: string;
  lastName: string;
  gender: string;
  age: number;
  location: { city: string; state: string; country: string; timezone: string };
  professional: { occupation: string; company: string; industry: string };
  hobbies: string[];
  expertiseAreas: string[];
  maturity: string;
  createdAt: string;
}

export function useLegends() {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['legends', productId],
    queryFn: () =>
      api<Legend[]>(`/legends${productId ? `?productId=${productId}` : ''}`, { token }),
    enabled: !!token && !!productId,
  });
}
