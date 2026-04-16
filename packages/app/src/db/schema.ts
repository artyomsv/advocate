/**
 * Drizzle schema barrel.
 *
 * Re-exports everything from schema/engine/ and schema/app/.
 * drizzle.config.ts and Drizzle client use this single entry point.
 */

export * from './schema/engine/index.js';
export * from './schema/app/index.js';

export const SCHEMA_VERSION = 1;
