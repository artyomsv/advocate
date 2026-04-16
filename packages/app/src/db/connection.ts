import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';
import * as schema from './schema.js';

const log = childLogger('db');

let pool: pg.Pool | undefined;
let db: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const env = getEnv();
    pool = new pg.Pool({ connectionString: env.DATABASE_URL });
    pool.on('error', (err) => {
      log.error({ err }, 'unexpected postgres pool error');
    });
  }
  return pool;
}

export function getDb() {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export async function pingDb(): Promise<boolean> {
  const result = await getPool().query('SELECT 1 AS ok');
  return result.rows[0]?.ok === 1;
}
