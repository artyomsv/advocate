import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { childLogger } from '../config/logger.js';
import { closeDb, getDb } from './connection.js';

// Load .env only when running outside a container. Inside Docker, env comes from
// the compose file / k8s manifest; no .env file is present and dotenv would log
// a (harmless) warning that pollutes migration logs.
if (process.env.NODE_ENV !== 'production' && !process.env.RUNNING_IN_CONTAINER) {
  await import('dotenv/config');
}

const log = childLogger('migrate');

async function run(): Promise<void> {
  const migrationsFolder = resolve(fileURLToPath(import.meta.url), '../../../drizzle/migrations');
  log.info({ migrationsFolder }, 'running migrations');
  const db = getDb();
  await migrate(db, { migrationsFolder });
  log.info('migrations complete');
  await closeDb();
}

run().catch((err) => {
  log.error({ err }, 'migration failed');
  process.exit(1);
});
