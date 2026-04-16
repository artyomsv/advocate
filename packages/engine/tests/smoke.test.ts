import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('engine smoke test', () => {
  it('exports a version constant', () => {
    expect(ENGINE_VERSION).toBe('0.1.0');
  });
});
