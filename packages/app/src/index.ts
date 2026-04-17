/**
 * @mynah/app — Social promotion application.
 *
 * Depends on @mynah/engine for the multi-agent orchestration core.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version: string };

export const APP_VERSION = packageJson.version;
