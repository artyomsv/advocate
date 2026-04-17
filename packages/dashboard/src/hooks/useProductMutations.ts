import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import type { Product } from './useProducts';

export type ProductUpdate = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;

export function useUpdateProduct(productId: string) {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProductUpdate) =>
      api<Product>(`/products/${productId}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['product-dashboard', productId] });
    },
  });
}
