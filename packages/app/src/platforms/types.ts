/**
 * Platform adapters abstract the operations an agent needs to interact with a
 * social platform: creating posts, fetching metrics, recording manual-posted
 * URLs. Each platform (Reddit, Twitter, Facebook, Dev.to, Manual) has its own
 * implementation of this interface.
 */

export interface CreatePostParams {
  contentPlanId: string;
  legendAccountId: string;
  communityId: string;
  content: string;
  /** Optional title (Reddit needs it; Twitter doesn't). */
  title?: string;
  promotionLevel: number;
  contentType: string;
  /** If true, we are responding to a parent thread/comment rather than creating
   *  a top-level post. `parentPlatformId` identifies what we're replying to. */
  parentPlatformId?: string;
}

export interface PlatformPostResult {
  /** Internal post row id (always returned, even for manual flow). */
  postId: string;
  /** Platform-native id. `null` for ManualAdapter until the human confirms. */
  platformPostId: string | null;
  /** Direct URL to the post. `null` for ManualAdapter until confirmed. */
  platformUrl: string | null;
  /** Human-readable instruction line for the dashboard to display. */
  status: 'posted' | 'pending_manual_post';
  /** When status='pending_manual_post', contains instructions for the human. */
  instructions?: string;
}

export interface PostMetrics {
  upvotes: number;
  downvotes: number;
  repliesCount: number;
  views: number;
  wasRemoved: boolean;
  measuredAt: Date;
}

export interface CommunityProfile {
  identifier: string;
  name: string;
  url?: string;
  subscriberCount?: number;
  /** Free-form description of rules as scraped/summarized. */
  rulesSummary?: string;
}

/**
 * Marker error — thrown by stub adapters so agents can catch it and fall back
 * to the manual adapter.
 */
export class NotImplementedYet extends Error {
  constructor(
    public readonly platform: string,
    public readonly operation: string,
  ) {
    super(
      `Platform "${platform}" has no implementation for "${operation}" yet. Use ManualAdapter as a fallback.`,
    );
    this.name = 'NotImplementedYet';
  }
}

/**
 * The contract every platform implementation must fulfill. Optional methods
 * (marked `?`) don't need to be implemented by every adapter — e.g. the Manual
 * adapter has no real `getPostMetrics` because there's nothing to poll.
 */
export interface PlatformAdapter {
  readonly platform: string;

  /** Create a top-level post or reply. */
  createPost(params: CreatePostParams): Promise<PlatformPostResult>;

  /**
   * Only ManualAdapter exposes this. Fills in `platformPostId` + `platformUrl`
   * after the human posted. Others throw `NotImplementedYet`.
   */
  recordManualPost?(postId: string, platformPostId: string, platformUrl: string): Promise<void>;

  /** Poll the platform for current metrics. Returns null if the post can't be
   *  fetched (deleted, private, etc.). */
  getPostMetrics?(platformPostId: string): Promise<PostMetrics | null>;

  /** Fetch community/subreddit/page info. */
  getCommunityInfo?(identifier: string): Promise<CommunityProfile | null>;
}
