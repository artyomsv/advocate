import type { PlatformAdapter } from './types.js';

export class PlatformRegistry {
  readonly #adapters = new Map<string, PlatformAdapter>();

  register(adapter: PlatformAdapter): void {
    if (this.#adapters.has(adapter.platform)) {
      throw new Error(`Platform "${adapter.platform}" already registered`);
    }
    this.#adapters.set(adapter.platform, adapter);
  }

  unregister(platform: string): boolean {
    return this.#adapters.delete(platform);
  }

  get(platform: string): PlatformAdapter | undefined {
    return this.#adapters.get(platform);
  }

  /** Like `get` but throws instead of returning undefined. */
  require(platform: string): PlatformAdapter {
    const adapter = this.#adapters.get(platform);
    if (!adapter) {
      throw new Error(`Platform "${platform}" is not registered`);
    }
    return adapter;
  }

  platforms(): readonly string[] {
    return Array.from(this.#adapters.keys());
  }
}
