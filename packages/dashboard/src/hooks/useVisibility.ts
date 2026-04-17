import { useQuery } from '@tanstack/react-query';
import { useApiToken } from '../auth/useApiToken';
import { api } from '../lib/api';
import { useProductStore } from '../stores/product.store';

export interface Community {
  id: string;
  platform: string;
  identifier: string;
  name: string;
  url: string | null;
  subscriberCount: number | null;
  postsPerDay: string | null;
  relevanceScore: string | null;
  activityScore: string | null;
  receptivenessScore: string | null;
  moderationRisk: string | null;
  cultureSummary: string | null;
  rulesSummary: string | null;
  status: 'discovered' | 'approved' | 'active' | 'paused' | 'blacklisted';
  createdAt: string;
  lastScannedAt: string | null;
}

export interface Insight {
  id: string;
  productId: string;
  body: string;
  generatedAt: string;
  metricsWindow: Record<string, unknown> | null;
}

export interface Post {
  id: string;
  contentPlanId: string | null;
  legendAccountId: string;
  communityId: string;
  platformPostId: string | null;
  platformUrl: string | null;
  content: string;
  contentType: string;
  promotionLevel: number;
  postedAt: string | null;
  upvotes: number;
  downvotes: number;
  repliesCount: number;
  views: number;
  wasRemoved: boolean;
  moderatorAction: string | null;
  lastMetricsUpdate: string | null;
  createdAt: string;
}

export interface PostMetricsPoint {
  id: string;
  postId: string;
  measuredAt: string;
  upvotes: number;
  downvotes: number;
  repliesCount: number;
  views: number;
}

export function useCommunities(platform?: string) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['communities', platform],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (platform) qp.set('platform', platform);
      return api<Community[]>(`/communities${qp.size ? `?${qp.toString()}` : ''}`, { token });
    },
    enabled: !!token,
  });
}

export function useInsights(limit = 50) {
  const token = useApiToken();
  const productId = useProductStore((s) => s.selectedProductId);
  return useQuery({
    queryKey: ['insights', productId, limit],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (productId) qp.set('productId', productId);
      qp.set('limit', String(limit));
      return api<Insight[]>(`/insights?${qp.toString()}`, { token });
    },
    enabled: !!token,
  });
}

export function usePosts(filters: { legendId?: string; communityId?: string } = {}, limit = 50) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['posts', filters, limit],
    queryFn: () => {
      const qp = new URLSearchParams();
      if (filters.legendId) qp.set('legendId', filters.legendId);
      if (filters.communityId) qp.set('communityId', filters.communityId);
      qp.set('limit', String(limit));
      return api<Post[]>(`/posts?${qp.toString()}`, { token });
    },
    enabled: !!token,
  });
}

export function usePostMetrics(postId: string | null) {
  const token = useApiToken();
  return useQuery({
    queryKey: ['post-metrics', postId],
    queryFn: () => api<PostMetricsPoint[]>(`/posts/${postId}/metrics`, { token }),
    enabled: !!token && !!postId,
  });
}
