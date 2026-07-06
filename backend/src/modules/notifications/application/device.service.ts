import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('devices');

export interface DeviceRecord {
  id: number;
  userId: number;
  deviceId: string;
  platform: string;
  browser: string | null;
  os: string | null;
  userAgent: string | null;
  pushToken: string | null;
  pushProvider: string;
  pushTokenExpiresAt: Date | null;
  ipAddress: string | null;
  isActive: boolean;
  lastSeenAt: Date;
}

export async function registerDevice(
  userId: number,
  deviceId: string,
  options: {
    platform?: string;
    browser?: string;
    os?: string;
    userAgent?: string;
    pushToken?: string;
    pushProvider?: string;
    pushTokenExpiresAt?: Date;
    ipAddress?: string;
  } = {},
): Promise<number> {
  const pool = getPool();
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO user_devices
       (user_id, device_id, platform, browser, os, user_agent, push_token, push_provider, push_token_expires_at, ip_address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       platform = VALUES(platform), browser = VALUES(browser), os = VALUES(os),
       user_agent = VALUES(user_agent), push_token = COALESCE(VALUES(push_token), push_token),
       push_provider = COALESCE(VALUES(push_provider), push_provider),
       ip_address = COALESCE(VALUES(ip_address), ip_address),
       last_seen_at = NOW(), is_active = TRUE`,
      [
        userId,
        deviceId,
        options.platform || 'unknown',
        options.browser || null,
        options.os || null,
        options.userAgent || null,
        options.pushToken || null,
        options.pushProvider || 'none',
        options.pushTokenExpiresAt || null,
        options.ipAddress || null,
      ],
    );
    return result.insertId;
  } catch (err: any) {
    log.error({ err, userId, deviceId }, 'Failed to register device');
    throw err;
  }
}

export async function getUserDevices(
  userId: number,
  activeOnly: boolean = true,
): Promise<DeviceRecord[]> {
  const pool = getPool();
  let sql = 'SELECT * FROM user_devices WHERE user_id = ?';
  if (activeOnly) sql += ' AND is_active = TRUE';
  sql += ' ORDER BY last_seen_at DESC';

  const [rows] = await pool.execute<RowDataPacket[]>(sql, [userId]);
  return rows as any[];
}

export async function deactivateDevice(
  userId: number,
  deviceId: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE user_devices SET is_active = FALSE WHERE user_id = ? AND device_id = ?',
    [userId, deviceId],
  );
}

export async function touchDevice(
  userId: number,
  deviceId: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE user_devices SET last_seen_at = NOW() WHERE user_id = ? AND device_id = ?',
    [userId, deviceId],
  );
}

export async function updatePushToken(
  userId: number,
  deviceId: string,
  pushToken: string,
  pushProvider: string = 'fcm',
  expiresAt?: Date,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    `UPDATE user_devices SET push_token = ?, push_provider = ?, push_token_expires_at = ?, last_seen_at = NOW()
     WHERE user_id = ? AND device_id = ?`,
    [pushToken, pushProvider, expiresAt || null, userId, deviceId],
  );
}
