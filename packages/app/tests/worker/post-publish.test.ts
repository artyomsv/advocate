import { describe, expect, it } from 'vitest';
import { splitTitleAndBody } from '../../src/worker/post-publish-worker.js';

describe('splitTitleAndBody', () => {
  it('uses the full content as title when no blank line', () => {
    expect(splitTitleAndBody('Just a one-liner')).toEqual({
      title: 'Just a one-liner',
      body: '',
    });
  });

  it('splits on the first blank line', () => {
    const input = 'My short title\n\nFirst paragraph of body.\n\nSecond paragraph.';
    expect(splitTitleAndBody(input)).toEqual({
      title: 'My short title',
      body: 'First paragraph of body.\n\nSecond paragraph.',
    });
  });

  it('truncates long titles at 300 chars', () => {
    const long = 'x'.repeat(500);
    const { title } = splitTitleAndBody(long);
    expect(title.length).toBe(300);
  });

  it('trims whitespace from title and body', () => {
    const input = '   Title with spaces   \n\n   Body with spaces   ';
    expect(splitTitleAndBody(input)).toEqual({
      title: 'Title with spaces',
      body: 'Body with spaces',
    });
  });
});
