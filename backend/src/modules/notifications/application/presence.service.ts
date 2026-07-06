import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('presence');
const PRESENCE_PREFIX = 'user:';
const PRESENCE_SUFFIX = ':online';
const PRESENCE_TTL = 120;
const RECONNECT_QUEUE_PREFIX = 'reconnect_queue:';
const RECONNECT_TTL = 86400;

export async function setOnline(userId: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.set(`${PRESENCE_PREFIX}${userId}${PRESENCE_SUFFIX}`, '1', { EX: PRESENCE_TTL });
    log.debug({ userId }, 'User set online');
  } catch (err) {
    log.error({ err, userId }, 'Failed to set user online');
  }
}

export async function setOffline(userId: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.del(`${PRESENCE_PREFIX}${userId}${PRESENCE_SUFFIX}`);
    log.debug({ userId }, 'User set offline');
  } catch (err) {
    log.error({ err, userId }, 'Failed to set user offline');
  }
}

export async function isOnline(userId: number): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const result = await redis.get(`${PRESENCE_PREFIX}${userId}${PRESENCE_SUFFIX}`);
    return result === '1';
  } catch (err) {
    log.error({ err, userId }, 'Failed to check user presence');
    return false;
  }
}

export async function refreshPresence(userId: number): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.expire(`${PRESENCE_PREFIX}${userId}${PRESENCE_SUFFIX}`, PRESENCE_TTL);
  } catch (err) {
    log.error({ err, userId }, 'Failed to refresh presence');
  }
}

export async function getOnlineUserIds(userIds: number[]): Promise<number[]> {
  try {
    const redis = getRedisClient();
    const pipeline = redis.multi();
    const keys = userIds.map((id) => `${PRESENCE_PREFIX}${id}${PRESENCE_SUFFIX}`);
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();
    return userIds.filter((_, i) => results?.[i]?.[1] === '1');
  } catch (err) {
    log.error({ err }, 'Failed to get online users');
    return [];
  }
}

export async function getOnlineCount(): Promise<number> {
  try {
    const redis = getRedisClient();
    const keys = await redis.keys(`${PRESENCE_PREFIX}*${PRESENCE_SUFFIX}`);
    return keys.length;
  } catch (err) {
    log.error({ err }, 'Failed to get online count');
    return 0;
  }
}

// ── Reconnect Queue ──

export async function queueForReconnect(userId: number, notificationIds: number[]): Promise<void> {
  try {
    const redis = getRedisClient();
    const key = `${RECONNECT_QUEUE_PREFIX}${userId}`;
    const existing = await redis.lRange(key, 0, -1);
    const existingSet = new Set(existing.map(Number));
    const toAdd = notificationIds.filter((id) => !existingSet.has(id));
    if (toAdd.length) {
      await redis.rPush(key, toAdd.map(String));
      await redis.expire(key, RECONNECT_TTL);
    }
  } catch (err) {
    log.error({ err, userId }, 'Failed to queue for reconnect');
  }
}

export async function getReconnectQueue(userId: number): Promise<number[]> {
  try {
    const redis = getRedisClient();
    const key = `${RECONNECT_QUEUE_PREFIX}${userId}`;
    const ids = await redis.lRange(key, 0, -1);
    await redis.del(key);
    return ids.map(Number);
  } catch (err) {
    log.error({ err, userId }, 'Failed to get reconnect queue');
    return [];
  }
}

export async function setOnlineWithReconnect(userId: number): Promise<number[]> {
  await setOnline(userId);
  return getReconnectQueue(userId);
}
