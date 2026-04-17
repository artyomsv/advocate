import { useQuery } from '@tanstack/react-query';
import type { JSX } from 'react';
import { useApiToken } from '../../auth/useApiToken';
import { api } from '../../lib/api';

interface Product {
  id: string;
  name: string;
  slug: string;
}

export function DashboardHome(): JSX.Element {
  const token = useApiToken();
  const products = useQuery({
    queryKey: ['products'],
    queryFn: () => api<Product[]>('/products', { token }),
    enabled: !!token,
  });

  const count = products.isLoading
    ? '…'
    : products.isError
      ? 'error'
      : (products.data?.length ?? 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <div className="rounded border border-slate-800 bg-slate-900 p-4">
        <div className="text-sm text-slate-400">Products</div>
        <div className="text-3xl">{count}</div>
      </div>
    </div>
  );
}
