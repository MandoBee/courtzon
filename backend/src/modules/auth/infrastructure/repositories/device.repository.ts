import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

export class DeviceRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async findOrCreate(data: {
    userId: number;
    fingerprint: string;
    deviceName?: string;
    deviceType?: string;
    os?: string;
    browser?: string;
    ipAddress: string;
    userAgent?: string;
  }): Promise<number> {
    const [existing] = await this.pool.execute<RowData>(
      `SELECT id FROM user_devices WHERE user_id = ? AND device_fingerprint = ?`,
      [data.userId, data.fingerprint]
    );
    if (existing.length) {
      await this.pool.execute(
        `UPDATE user_devices SET last_seen_at = NOW(), ip_address = ?, user_agent = ? WHERE id = ?`,
        [data.ipAddress, data.userAgent || null, existing[0].id]
      );
      return existing[0].id;
    }
    const [result] = await this.pool.execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO user_devices (user_id, device_fingerprint, device_name, device_type, os, browser, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.userId, data.fingerprint, data.deviceName || null, data.deviceType || null,
       data.os || null, data.browser || null, data.ipAddress, data.userAgent || null]
    );
    return result.insertId;
  }
}
