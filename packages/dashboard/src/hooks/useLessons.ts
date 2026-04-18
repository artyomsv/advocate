import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';

export interface Lesson {
  id: string;
  agentId: string;
  sourceEpisodeIds: string[];
  summary: string;
  lessons: string[];
  periodFrom: string;
  periodTo: string;
  consolidatedAt: string;
}

export function useLessons(agentId?: string) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['lessons', agentId],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (agentId) qp.set('agentId', agentId);
      return api<Lesson[]>(`/lessons${qp.size ? `?${qp.toString()}` : ''}`, { token });
    },
    enabled: !!token,
    refetchInterval: 60_000,
  });
}

export function useDeleteLesson() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>(`/lessons/${id}`, { method: 'DELETE', token, parseJson: false }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['lessons'] });
    },
  });
}

export function useTriggerConsolidate() {
  const token = useApiToken();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ enqueued: boolean }>('/memory/consolidate', { method: 'POST', token }),
    onSuccess: () => {
      // Invalidate after a small delay — the consolidator runs async.
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ['lessons'] });
      }, 8000);
    },
  });
}
