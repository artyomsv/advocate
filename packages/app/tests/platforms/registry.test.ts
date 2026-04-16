import { describe, expect, it } from 'vitest';
import { PlatformRegistry } from '../../src/platforms/registry.js';
import type { PlatformAdapter } from '../../src/platforms/types.js';

function stub(name: string): PlatformAdapter {
  return {
    platform: name,
    async createPost() {
      throw new Error('not used in test');
    },
  };
}

describe('PlatformRegistry', () => {
  it('register + get round-trip', () => {
    const reg = new PlatformRegistry();
    const a = stub('reddit');
    reg.register(a);
    expect(reg.get('reddit')).toBe(a);
  });

  it('get returns undefined for unknown platform', () => {
    const reg = new PlatformRegistry();
    expect(reg.get('twitter')).toBeUndefined();
  });

  it('register throws on duplicate platform', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    expect(() => reg.register(stub('reddit'))).toThrow(/already registered/);
  });

  it('platforms() returns all registered platform names', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    reg.register(stub('manual'));
    expect(reg.platforms().sort()).toEqual(['manual', 'reddit']);
  });

  it('require returns adapter or throws with clear message', () => {
    const reg = new PlatformRegistry();
    const a = stub('reddit');
    reg.register(a);
    expect(reg.require('reddit')).toBe(a);
    expect(() => reg.require('twitter')).toThrow(/twitter.*not registered/i);
  });

  it('unregister removes', () => {
    const reg = new PlatformRegistry();
    reg.register(stub('reddit'));
    expect(reg.unregister('reddit')).toBe(true);
    expect(reg.get('reddit')).toBeUndefined();
    expect(reg.unregister('reddit')).toBe(false);
  });
});
