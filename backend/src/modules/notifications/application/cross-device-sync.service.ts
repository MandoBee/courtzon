import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';
import { eventBusV2 } from '../../../shared/event-bus/event-bus.v2.js';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('cross-device-sync');

const SYNC_CHANNEL = 'notification:sync';
const DEVICE_PREFIX = 'device:user:';
const DEVICE_TTL = 86400;

export async function registerUserDevice(userId: number, deviceId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    await redis.sAdd(`${DEVICE_PREFIX}${userId}`, deviceId);
    await redis.expire(`${DEVICE_PREFIX}${userId}`, DEVICE_TTL);
  } catch (err: any) {
    log.error({ err, userId }, 'Failed to register device in redis');
  }
}

export async function getUserDeviceIds(userId: number): Promise<string[]> {
  try {
    const redis = getRedisClient();
    return await redis.sMembers(`${DEVICE_PREFIX}${userId}`);
  } catch {
    return [];
  }
}

export async function broadcastToUserDevices(
  userId: number,
  event: string,
  data: any,
  excludeDeviceId?: string,
): Promise<void> {
  try {
    const deviceIds = await getUserDeviceIds(userId);

    for (const deviceId of deviceIds) {
      if (excludeDeviceId && deviceId === excludeDeviceId) continue;
      eventBusV2.emit(event, { ...data, userId } as Record<string, unknown>, {
        aggregateType: 'notification',
        aggregateId: String(userId),
        aggregateVersion: 1,
      });
    }
  } catch (err: any) {
    log.error({ err, userId, event }, 'Failed to broadcast to devices');
  }
}

export async function syncNotificationRead(
  userId: number,
  notificationId: number,
  sourceDeviceId: string,
): Promise<void> {
  try {
    eventBusV2.emit('notification:sync-read', { userId, notificationId, sourceDeviceId, timestamp: new Date().toISOString() }, {
      aggregateType: 'notification',
      aggregateId: String(notificationId),
      aggregateVersion: 1,
    });
  } catch (err: any) {
    log.error({ err, userId, notificationId }, 'Failed to sync read state');
  }
}

export async function syncNotificationDeleted(
  userId: number,
  notificationId: number,
  sourceDeviceId: string,
): Promise<void> {
  try {
    eventBusV2.emit('notification:sync-deleted', { userId, notificationId, sourceDeviceId, timestamp: new Date().toISOString() }, {
      aggregateType: 'notification',
      aggregateId: String(notificationId),
      aggregateVersion: 1,
    });
  } catch (err: any) {
    log.error({ err, userId, notificationId }, 'Failed to sync deleted state');
  }
}
