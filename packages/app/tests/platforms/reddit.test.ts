import { describe, expect, it } from 'vitest';
import { NotImplementedYet, RedditAdapter } from '../../src/platforms/index.js';

describe('RedditAdapter (stub)', () => {
  it('platform is "reddit"', () => {
    const a = new RedditAdapter();
    expect(a.platform).toBe('reddit');
  });

  it('createPost throws NotImplementedYet with helpful message', async () => {
    const a = new RedditAdapter();
    await expect(
      a.createPost({
        contentPlanId: 'x',
        legendAccountId: 'x',
        communityId: 'x',
        content: 'x',
        promotionLevel: 0,
        contentType: 'helpful_comment',
      }),
    ).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('getPostMetrics also throws NotImplementedYet', async () => {
    const a = new RedditAdapter();
    await expect(a.getPostMetrics!('t3_abc')).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('getCommunityInfo also throws NotImplementedYet', async () => {
    const a = new RedditAdapter();
    await expect(a.getCommunityInfo!('r/Plumbing')).rejects.toBeInstanceOf(NotImplementedYet);
  });

  it('error message mentions fallback guidance', async () => {
    const a = new RedditAdapter();
    try {
      await a.createPost({
        contentPlanId: 'x',
        legendAccountId: 'x',
        communityId: 'x',
        content: 'x',
        promotionLevel: 0,
        contentType: 'helpful_comment',
      });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain('ManualAdapter');
    }
  });
});
