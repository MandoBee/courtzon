import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { getPool } from '../../../database/mysql.js';

async function getSetting(key: string, fallback: number): Promise<number> {
  try {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      'SELECT value FROM system_settings WHERE `key` = ? LIMIT 1', [key]
    );
    if (rows.length) return parseInt(rows[0].value, 10) || fallback;
  } catch {}
  return fallback;
}

class BruteForceService {
  private maxAttempts: number | null = null;
  private windowSecs: number | null = null;
  private lockoutSecs: number | null = null;

  private async ensureLoaded() {
    if (this.maxAttempts === null) {
      [this.maxAttempts, this.windowSecs, this.lockoutSecs] = await Promise.all([
        getSetting('security.max_login_attempts', 5),
        getSetting('security.brute_force_window_minutes', 15).then(m => m * 60),
        getSetting('security.lockout_duration_minutes', 30).then(m => m * 60),
      ]);
    }
  }

  private getKey(identifier: string): string {
    return `brute:login:${identifier}`;
  }

  private getLockoutKey(identifier: string): string {
    return `brute:lockout:${identifier}`;
  }

  async recordFailedAttempt(identifier: string): Promise<void> {
    await this.ensureLoaded();
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const multi = redis.multi();
    multi.incr(key);
    multi.expire(key, this.windowSecs!);
    await multi.exec();

    const attempts = await redis.get(key);
    if (parseInt(attempts || '0', 10) >= this.maxAttempts!) {
      const lockoutKey = this.getLockoutKey(identifier);
      await redis.set(lockoutKey, '1', 'EX', this.lockoutSecs!);
    }
  }

  async isLockedOut(identifier: string): Promise<boolean> {
    const redis = getRedisClient();
    const lockoutKey = this.getLockoutKey(identifier);
    const locked = await redis.get(lockoutKey);
    return locked === '1';
  }

  async getRemainingAttempts(identifier: string): Promise<number> {
    await this.ensureLoaded();
    const redis = getRedisClient();
    const key = this.getKey(identifier);
    const attempts = await redis.get(key);
    const count = parseInt(attempts || '0', 10);
    return Math.max(0, this.maxAttempts! - count);
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
