import { describe, expect, it } from 'vitest';
import { parseScoreJson } from '../../src/agents/scout.js';

describe('parseScoreJson', () => {
  it('parses a raw JSON object', () => {
    const out = parseScoreJson('{"scores":{"a":8,"b":3}}');
    expect(out.scores).toEqual({ a: 8, b: 3 });
  });

  it('parses JSON fenced in a code block', () => {
    const raw = '```json\n{"scores":{"x":10,"y":0}}\n```';
    expect(parseScoreJson(raw).scores).toEqual({ x: 10, y: 0 });
  });

  it('clamps out-of-range scores to 0..10', () => {
    const out = parseScoreJson('{"scores":{"lo":-3,"hi":42}}');
    expect(out.scores).toEqual({ lo: 0, hi: 10 });
  });

  it('ignores non-numeric values', () => {
    const out = parseScoreJson('{"scores":{"a":"not-a-number","b":5}}');
    expect(out.scores).toEqual({ b: 5 });
  });
});
