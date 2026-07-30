import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('devices');

export interface DeviceRecord {
  id: number;
  userId: number;
  deviceFingerprint: string;
  deviceName: string | null;
  deviceType: string | null;
  os: string | null;
  browser: string | null;
  ipAddress: string;
  userAgent: string | null;
  isActive: boolean;
  lastSeenAt: Date;
  firstSeenAt: Date;
  createdAt: Date;
}

function mapRow(row: any): DeviceRecord {
  return {
    id: row.id,
    userId: row.user_id,
    deviceFingerprint: row.device_fingerprint,
    deviceName: row.device_name,
    deviceType: row.device_type,
    os: row.os,
    browser: row.browser,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    isActive: !!row.is_active,
    lastSeenAt: row.last_seen_at,
    firstSeenAt: row.first_seen_at,
    createdAt: row.created_at,
  };
}

export async function registerDevice(
  userId: number,
  deviceFingerprint: string,
  options: {
    deviceName?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
    userAgent?: string;
    ipAddress?: string;
  } = {},
): Promise<number> {
  const pool = getPool();
  try {
    const [existing] = await pool.execute<RowDataPacket[]>(
      'SELECT id FROM user_devices WHERE user_id = ? AND device_fingerprint = ?',
      [userId, deviceFingerprint],
    );
    if (existing.length) {
      await pool.execute(
        'UPDATE user_devices SET last_seen_at = NOW(), ip_address = ?, user_agent = ?, device_name = COALESCE(?, device_name), device_type = COALESCE(?, device_type), os = COALESCE(?, os), browser = COALESCE(?, browser) WHERE id = ?',
        [
          options.ipAddress || null, options.userAgent || null,
          options.deviceName || null, options.deviceType || null,
          options.os || null, options.browser || null,
          existing[0].id,
        ],
      );
      return existing[0].id;
    }
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO user_devices (user_id, device_fingerprint, device_name, device_type, os, browser, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, deviceFingerprint, options.deviceName || null,
        options.deviceType || null, options.os || null, options.browser || null,
        options.ipAddress || null, options.userAgent || null,
      ],
    );
    return result.insertId;
  } catch (err: any) {
    log.error({ err, userId, deviceFingerprint }, 'Failed to register device');
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
  return (rows as any[]).map(mapRow);
}

export async function deactivateDevice(
  userId: number,
  deviceFingerprint: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE user_devices SET is_active = FALSE WHERE user_id = ? AND device_fingerprint = ?',
    [userId, deviceFingerprint],
  );
}

export async function touchDevice(
  userId: number,
  deviceFingerprint: string,
): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE user_devices SET last_seen_at = NOW() WHERE user_id = ? AND device_fingerprint = ?',
    [userId, deviceFingerprint],
  );
}

export async function getPushTokens(userId: number): Promise<{ token: string; platform: string }[]> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT token, platform FROM push_tokens WHERE user_id = ? AND is_active = TRUE",
    [userId],
  );
  return rows as any[];
}

export async function savePushToken(
  userId: number,
  token: string,
  platform: 'ios' | 'android' | 'web',
  options?: { deviceName?: string; appVersion?: string; osVersion?: string; deviceModel?: string },
): Promise<number> {
  const pool = getPool();
  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT id FROM push_tokens WHERE user_id = ? AND token = ?',
    [userId, token],
  );
  if (existing.length) {
    await pool.execute(
      'UPDATE push_tokens SET last_used_at = NOW(), is_active = TRUE, platform = ?, device_name = COALESCE(?, device_name), app_version = COALESCE(?, app_version), os_version = COALESCE(?, os_version), device_model = COALESCE(?, device_model) WHERE id = ?',
      [platform, options?.deviceName || null, options?.appVersion || null, options?.osVersion || null, options?.deviceModel || null, existing[0].id],
    );
    return existing[0].id;
  }
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO push_tokens (user_id, token, platform, device_name, app_version, os_version, device_model, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [userId, token, platform, options?.deviceName || null, options?.appVersion || null, options?.osVersion || null, options?.deviceModel || null],
  );
  return result.insertId;
}

export async function removePushToken(userId: number, token: string): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE push_tokens SET is_active = FALSE WHERE user_id = ? AND token = ?',
    [userId, token],
  );
}
