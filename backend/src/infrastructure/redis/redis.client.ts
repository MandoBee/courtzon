import Redis from "ioredis";
import { createModuleLogger } from "../../shared/utils/logger.js";
import { env } from "../../config/env.js";

const log = createModuleLogger('redis');

let redisClient: any = null;

export function getRedisClient(): any {
  if (redisClient) {
    return redisClient;
  }

  redisClient = new (Redis as any)({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    db: env.REDIS_DB,
    retryStrategy: (times: number) => Math.min(times * 100, 3000),
    maxRetriesPerRequest: null,
  });

  redisClient.on("error", (error: unknown) => {
    log.error(error, "Redis connection error");
  });

  return redisClient;
}

export async function closeRedisClient(): Promise<void> {
  if (!redisClient) {
    return;
  }

  await redisClient.quit();

  redisClient = null;
}