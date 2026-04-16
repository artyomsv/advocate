import type {
  CommunityProfile,
  CreatePostParams,
  PlatformAdapter,
  PlatformPostResult,
  PostMetrics,
} from './types.js';
import { NotImplementedYet } from './types.js';

/**
 * Stub adapter. Real snoowrap-backed implementation lands in a future plan
 * (Plan 10.5) once we have OAuth credentials + rate limiter wiring. For now
 * the stub exposes the shape so upstream agents can code against the type
 * and catch `NotImplementedYet` to fall back to `ManualAdapter`.
 */
export class RedditAdapter implements PlatformAdapter {
  readonly platform = 'reddit';

  async createPost(_params: CreatePostParams): Promise<PlatformPostResult> {
    throw new NotImplementedYet(this.platform, 'createPost');
  }

  async getPostMetrics(_platformPostId: string): Promise<PostMetrics | null> {
    throw new NotImplementedYet(this.platform, 'getPostMetrics');
  }

  async getCommunityInfo(_identifier: string): Promise<CommunityProfile | null> {
    throw new NotImplementedYet(this.platform, 'getCommunityInfo');
  }
}
