import 'dotenv/config';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

async function run(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set');
  }

  const migrationsFolder = resolve(fileURLToPath(import.meta.url), '../../../drizzle/migrations');
  console.log(JSON.stringify({ migrationsFolder }, null, 2));
  console.log('running migrations...');

  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder });
    console.log('migrations complete');
  } finally {
    await pool.end();
  }
}

run().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
