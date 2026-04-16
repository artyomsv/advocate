import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index.js';

describe('engine smoke test', () => {
  it('exports a semver-shaped version string', () => {
    expect(typeof ENGINE_VERSION).toBe('string');
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it('matches the version declared in package.json', () => {
    const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
    const { version } = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };
    expect(ENGINE_VERSION).toBe(version);
  });
});
