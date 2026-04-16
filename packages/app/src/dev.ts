import { resolve } from 'node:path';
import { config } from 'dotenv';

// Load .env from project root (3 levels up from src/)
config({ path: resolve(import.meta.dirname, '../../../.env') });

// Now import and start the server
import('./server/server.js').then((module) => {
  void module.start();
});
