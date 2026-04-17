import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export type TaskStatus =
  | 'backlog'
  | 'in_progress'
  | 'in_review'
  | 'approved'
  | 'done'
  | 'blocked';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  type: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: TaskStatus;
  assignedTo?: string;
  createdBy: string;
  dependsOn: string[];
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export function useTasks() {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['tasks', productId],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('projectId', productId);
      return api<Task[]>(`/tasks${qp.size ? `?${qp.toString()}` : ''}`, { token });
    },
    enabled: !!token,
    refetchInterval: 15_000,
  });
}

export function useUpdateTaskStatus() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      api<Task>(`/tasks/${id}/status`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
