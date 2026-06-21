import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

interface SessionRow {
  id: number;
  user_id: number;
  device_id: number | null;
  session_token: string;
  refresh_token_hash: string;
  expires_at: string;
  is_revoked: boolean;
}

export class SessionRepository {
  private pool: mysql.Pool;

  constructor() {
    this.pool = getPool();
  }

  async create(data: {
    userId: number;
    deviceId: number | null;
    sessionToken: string;
    refreshToken: string;
    refreshTokenHash: string;
    ipAddress: string;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO user_sessions (user_id, device_id, session_token, refresh_token, refresh_token_hash,
        ip_address, user_agent, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.userId, data.deviceId, data.sessionToken, data.refreshToken, data.refreshTokenHash,
       data.ipAddress, data.userAgent, data.expiresAt]
    );
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<SessionRow | null> {
    const [rows] = await this.pool.execute<RowData>(
      `SELECT * FROM user_sessions WHERE refresh_token_hash = ? AND is_revoked = FALSE LIMIT 1`,
      [refreshTokenHash]
    );
    return rows.length ? (rows[0] as unknown as SessionRow) : null;
  }

  async revoke(id: number): Promise<void> {
    await this.pool.execute(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE id = ?`,
      [id]
    );
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = ? AND is_revoked = FALSE`,
      [userId]
    );
  }

  async revokeAllForUserExcept(userId: number, exceptSessionId: number): Promise<void> {
    await this.pool.execute(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE user_id = ? AND is_revoked = FALSE AND id != ?`,
      [userId, exceptSessionId]
    );
  }

  async cleanupExpired(): Promise<void> {
    await this.pool.execute(
      `UPDATE user_sessions SET is_revoked = TRUE WHERE expires_at < NOW() AND is_revoked = FALSE`
    );
  }
}

export const sessionRepository = new SessionRepository();
