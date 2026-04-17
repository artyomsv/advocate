import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import type { Product } from './useProducts';

export type ProductUpdate = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>;

export interface CreateProductInput {
  name: string;
  slug: string;
  description: string;
  url?: string;
}

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

export function useCreateProduct() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) =>
      api<Product>('/products', {
        method: 'POST',
        token,
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}

export function useDeleteProduct() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) =>
      api<void>(`/products/${productId}`, {
        method: 'DELETE',
        token,
        parseJson: false,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['products'] });
    },
  });
}
