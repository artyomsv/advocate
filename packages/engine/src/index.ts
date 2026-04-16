/**
 * @advocate/engine — Reusable multi-agent orchestration engine.
 *
 * This package contains the domain-agnostic core.
 * All social-media-specific logic lives in @advocate/app.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };

export const ENGINE_VERSION = packageJson.version;
