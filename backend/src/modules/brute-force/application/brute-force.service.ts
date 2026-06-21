import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';

const MAX_LOGIN_ATTEMPTS = 5;
const WINDOW_SECONDS = 900;
const LOCKOUT_DURATION_SECONDS = 1800;

class BruteForceService {
  private getKey(identifier: string): string {
    return `brute:login:${identifier}`;
  }

  private getLockoutKey(identifier: string): string {
    return `brute:lockout:${identifier}`;
  }

  async recordFailedAttempt(identifier: string): Promise<void> {
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, WINDOW_SECONDS);
    await multi.exec();

    const attempts = await redis.get(key);
    if (parseInt(attempts || '0', 10) >= MAX_LOGIN_ATTEMPTS) {
      const lockoutKey = this.getLockoutKey(identifier);
      await redis.set(lockoutKey, '1', 'EX', LOCKOUT_DURATION_SECONDS);
    }
  }

  async isLockedOut(identifier: string): Promise<boolean> {
    const redis = getRedisClient();
    const lockoutKey = this.getLockoutKey(identifier);
    const locked = await redis.get(lockoutKey);
    return locked === '1';
  }

  async getRemainingAttempts(identifier: string): Promise<number> {
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const attempts = await redis.get(key);
    const count = parseInt(attempts || '0', 10);
    return Math.max(0, MAX_LOGIN_ATTEMPTS - count);
  }

  async clearAttempts(identifier: string): Promise<void> {
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const lockoutKey = this.getLockoutKey(identifier);
    await Promise.all([redis.del(key), redis.del(lockoutKey)]);
  }

  async getLockoutTTL(identifier: string): Promise<number> {
    const redis = getRedisClient();
    const lockoutKey = this.getLockoutKey(identifier);
    return (await redis.ttl(lockoutKey)) || 0;
  }
}

export const bruteForceService = new BruteForceService();
