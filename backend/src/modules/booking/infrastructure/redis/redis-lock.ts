import { getRedisClient } from '../../../../infrastructure/redis/redis.client.js';

const LOCK_TTL_MS = 15000;
const LOCK_PREFIX = 'booking:lock:';
const COACH_LOCK_PREFIX = 'booking:lock:coach:';

export class RedisLock {
  private redis: any;

  constructor() {
    this.redis = getRedisClient();
  }

  lockKey(resourceId: number, date: string, slotStart: string): string {
    return `${LOCK_PREFIX}${resourceId}:${date}:${slotStart}`;
  }

  coachLockKey(coachId: number, date: string, slotStart: string): string {
    return `${COACH_LOCK_PREFIX}${coachId}:${date}:${slotStart}`;
  }

  async acquire(resourceId: number, date: string, slotStart: string, owner: string): Promise<boolean> {
    const key = this.lockKey(resourceId, date, slotStart);
    const result = await this.redis.set(key, owner, 'PX', LOCK_TTL_MS, 'NX');
    return result === 'OK';
  }

  async acquireCoach(coachId: number, date: string, slotStart: string, owner: string): Promise<boolean> {
    const key = this.coachLockKey(coachId, date, slotStart);
    const result = await this.redis.set(key, owner, 'PX', LOCK_TTL_MS, 'NX');
    return result === 'OK';
  }

  async release(resourceId: number, date: string, slotStart: string, owner: string): Promise<void> {
    const key = this.lockKey(resourceId, date, slotStart);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, key, owner);
  }

  async releaseCoach(coachId: number, date: string, slotStart: string, owner: string): Promise<void> {
    const key = this.coachLockKey(coachId, date, slotStart);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    await this.redis.eval(script, 1, key, owner);
  }

  async acquireAll(slots: { resourceId: number; date: string; slotStart: string }[], owner: string, timeout: number = 5000): Promise<boolean> {
    const startTime = Date.now();
    const acquired: string[] = [];

    try {
      for (const slot of slots) {
        if (Date.now() - startTime > timeout) {
          return false;
        }
        const locked = await this.acquire(slot.resourceId, slot.date, slot.slotStart, owner);
        if (locked) {
          acquired.push(this.lockKey(slot.resourceId, slot.date, slot.slotStart));
        } else {
          return false;
        }
      }
      return true;
    } finally {
      if (acquired.length !== slots.length) {
        for (const key of acquired) {
          const [, resourceId, date, slotStart] = key.match(/booking:lock:(\d+):(.+):(.+)/) || [];
          if (resourceId && date && slotStart) {
            await this.release(Number(resourceId), date, slotStart, owner).catch(() => {});
          }
        }
      }
    }
  }

  async releaseAll(slots: { resourceId: number; date: string; slotStart: string }[], owner: string): Promise<void> {
    for (const slot of slots) {
      await this.release(slot.resourceId, slot.date, slot.slotStart, owner).catch(() => {});
    }
  }
}

export const redisLock = new RedisLock();
