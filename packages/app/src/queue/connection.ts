import { Redis } from 'ioredis';
import { getEnv } from '../config/env.js';
import { childLogger } from '../config/logger.js';

const log = childLogger('queue');

let client: Redis | undefined;

export function getRedis(): Redis {
  if (!client) {
    const env = getEnv();
    client = new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null, // required by BullMQ
      enableReadyCheck: false,
    });
    client.on('error', (err: Error) => {
      log.error({ err }, 'redis error');
    });
    client.on('connect', () => {
      log.info('redis connected');
    });
  }
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = undefined;
  }
}

export async function pingRedis(): Promise<boolean> {
  const response = await getRedis().ping();
  return response === 'PONG';
}
