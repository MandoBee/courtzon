import { getRedisClient } from './redis.client.js';

const DEFAULT_TTL = 300;

class RedisCacheService {
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const data = await redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = DEFAULT_TTL): Promise<void> {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    await redis.set(key, serialized, 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(key);
  }

  async delPattern(pattern: string): Promise<void> {
    const redis = getRedisClient();
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  }

  async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttlSeconds = DEFAULT_TTL
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const fresh = await fetchFn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  cacheKey(...parts: string[]): string {
    return `cache:${parts.join(':')}`;
  }
}

export const cacheService = new RedisCacheService();
