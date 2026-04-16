import { describe, expect, it } from 'vitest';
import { buildContextBlock } from '../../src/prompts/context-builder.js';
import type { PromptContext } from '../../src/prompts/types.js';

const minimal: PromptContext = {
  task: {
    type: 'helpful_comment',
    promotionLevel: 0,
    instructions: 'Reply to the thread helpfully.',
  },
};

describe('buildContextBlock', () => {
  it('includes task type + promotion level + instructions', () => {
    const text = buildContextBlock(minimal);
    expect(text).toContain('helpful_comment');
    expect(text).toContain('0');
    expect(text).toContain('Reply to the thread helpfully.');
  });

  it('promotion level 0 sets an explicit no-mention instruction', () => {
    const text = buildContextBlock(minimal);
    expect(text.toLowerCase()).toMatch(/not mention|no product/);
  });

  it('promotion level 5+ loosens the mention constraint', () => {
    const text = buildContextBlock({
      ...minimal,
      task: { ...minimal.task, promotionLevel: 5 },
    });
    expect(text.toLowerCase()).not.toContain('do not mention');
  });

  it('includes platform when provided', () => {
    const text = buildContextBlock({
      ...minimal,
      platform: { id: 'reddit', name: 'Reddit' },
    });
    expect(text).toContain('Reddit');
  });

  it('includes community name + rules + culture', () => {
    const text = buildContextBlock({
      ...minimal,
      community: {
        id: 'r-plumbing',
        name: 'r/Plumbing',
        platform: 'reddit',
        rulesSummary: 'No self-promotion. Flair required.',
        cultureSummary: 'Practical, blue-collar tone.',
      },
    });
    expect(text).toContain('r/Plumbing');
    expect(text).toContain('No self-promotion');
    expect(text).toContain('blue-collar');
  });

  it('includes thread summary when provided', () => {
    const text = buildContextBlock({
      ...minimal,
      thread: {
        url: 'https://reddit.com/r/Plumbing/abc',
        summary: 'OP asking about PEX vs copper for a remodel.',
      },
    });
    expect(text).toContain('PEX vs copper');
  });

  it('includes relevant memories as bullet list', () => {
    const text = buildContextBlock({
      ...minimal,
      relevantMemories: [
        'r/Plumbing responds well to specific dollar amounts',
        'copper_joe is a friendly contact',
      ],
    });
    expect(text).toContain('specific dollar amounts');
    expect(text).toContain('copper_joe');
    expect(text.toLowerCase()).toContain('memor');
  });

  it('includes recent activity when present', () => {
    const text = buildContextBlock({
      ...minimal,
      recentActivity: ['Posted in r/Plumbing 2 days ago', 'Last product mention 14 days ago'],
    });
    expect(text).toContain('2 days ago');
    expect(text).toContain('14 days ago');
  });

  it('deterministic', () => {
    const a = buildContextBlock(minimal);
    const b = buildContextBlock(minimal);
    expect(a).toBe(b);
  });

  it('handles the minimal case (task only)', () => {
    const text = buildContextBlock(minimal);
    expect(text.length).toBeGreaterThan(0);
  });
});
