import Redis from 'ioredis';

/**
 * Shared ioredis connections. Pub/sub requires a dedicated subscriber connection
 * (a connection in subscribe mode cannot issue normal commands), so we keep separate
 * lazily-created singletons for commands vs. subscriptions.
 */
const globalForRedis = globalThis as unknown as {
  redisClient?: Redis;
  redisSubscriber?: Redis;
};

const url = process.env.REDIS_URL ?? 'redis://localhost:6379';

export function getRedis(): Redis {
  if (!globalForRedis.redisClient) {
    globalForRedis.redisClient = new Redis(url, { maxRetriesPerRequest: null });
  }
  return globalForRedis.redisClient;
}

export function getSubscriber(): Redis {
  if (!globalForRedis.redisSubscriber) {
    globalForRedis.redisSubscriber = new Redis(url, { maxRetriesPerRequest: null });
  }
  return globalForRedis.redisSubscriber;
}
