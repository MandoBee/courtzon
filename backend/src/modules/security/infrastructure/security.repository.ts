import { getPool } from '../../../database/mysql.js';
import { getRedisClient } from '../../../infrastructure/redis/redis.client.js';

export class SecurityRepository {
  async getActiveSessions(limit = 50, offset = 0): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT us.id, us.user_id, us.ip_address, us.ip_country, us.user_agent,
              us.last_activity_at, us.expires_at, us.created_at, us.suspicious,
              u.full_name, u.email,
              ud.device_fingerprint, ud.device_name, ud.device_type, ud.os, ud.browser
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       LEFT JOIN user_devices ud ON ud.id = us.device_id
       WHERE us.is_revoked = FALSE AND us.expires_at > NOW()
       ORDER BY us.last_activity_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return rows as any[];
  }

  async countActiveSessions(): Promise<number> {
    const pool = getPool();
    const [rows] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM user_sessions WHERE is_revoked = FALSE AND expires_at > NOW()`
    );
    return rows[0]?.count || 0;
  }

  async getSuspiciousSessions(limit = 20): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT us.*, u.full_name, u.email
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       WHERE us.suspicious = TRUE AND us.is_revoked = FALSE AND us.expires_at > NOW()
       ORDER BY us.last_activity_at DESC LIMIT ?`,
      [limit]
    );
    return rows as any[];
  }

  async revokeSession(sessionId: number): Promise<void> {
    const pool = getPool();
    await pool.execute(`UPDATE user_sessions SET is_revoked = TRUE WHERE id = ?`, [sessionId]);
  }

  async getFailedLoginStats(days = 7): Promise<any> {
    const pool = getPool();
    const [daily] = await pool.execute(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM login_attempts WHERE success = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at) ORDER BY date`,
      [days]
    );
    const [topIps] = await pool.execute(
      `SELECT identifier, COUNT(*) as attempts, MAX(created_at) as last_attempt
       FROM login_attempts WHERE success = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
       GROUP BY identifier ORDER BY attempts DESC LIMIT 10`,
      [days]
    );
    const [total] = await pool.execute<any[]>(
      `SELECT COUNT(*) as total FROM login_attempts WHERE success = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    const [lockedAccounts] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM users WHERE account_status = 'suspended'`
    );
    return {
      daily: daily as any[],
      topIps: topIps as any[],
      totalFailed: total[0]?.total || 0,
      lockedAccounts: lockedAccounts[0]?.count || 0,
    };
  }

  async getFailedLoginFeed(limit = 20): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT la.*, u.full_name
       FROM login_attempts la
       LEFT JOIN users u ON u.full_phone = la.identifier COLLATE utf8mb4_unicode_ci
       WHERE la.success = FALSE
       ORDER BY la.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows as any[];
  }

  async getUploadSecurityStats(days = 7): Promise<any> {
    const pool = getPool();
    const [uploadVolume] = await pool.execute<any[]>(
      `SELECT COUNT(*) as total, SUM(file_size) as totalBytes
       FROM uploads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    const [byType] = await pool.execute(
      `SELECT mime_type, COUNT(*) as count, SUM(file_size) as totalBytes
       FROM uploads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY mime_type ORDER BY count DESC`,
      [days]
    );
    const [byEntity] = await pool.execute(
      `SELECT entity_type, COUNT(*) as count
       FROM uploads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY entity_type ORDER BY count DESC`,
      [days]
    );
    return {
      total: uploadVolume[0]?.total || 0,
      totalBytes: uploadVolume[0]?.totalBytes || 0,
      byType: byType as any[],
      byEntity: byEntity as any[],
    };
  }

  async getRecentUploads(limit = 20): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT u.*, up.full_name as uploaded_by_name
       FROM uploads u
       LEFT JOIN users up ON up.id = u.entity_id
       ORDER BY u.created_at DESC LIMIT ?`,
      [limit]
    );
    return rows as any[];
  }

  async getSecurityDashboard(days = 7): Promise<any> {
    const pool = getPool();
    const [failedLogins] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM login_attempts WHERE success = FALSE AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    const [activeSessions] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM user_sessions WHERE is_revoked = FALSE AND expires_at > NOW()`
    );
    const [suspiciousSessions] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM user_sessions WHERE suspicious = TRUE AND is_revoked = FALSE`
    );
    const [lockedUsers] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM users WHERE account_status = 'suspended'`
    );
    const [todayFailedLogins] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM login_attempts WHERE success = FALSE AND DATE(created_at) = CURDATE()`
    );
    const [recentUploads] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM uploads WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );
    const [auditActions] = await pool.execute<any[]>(
      `SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [days]
    );

    return {
      failedLogins: failedLogins[0]?.count || 0,
      activeSessions: activeSessions[0]?.count || 0,
      suspiciousSessions: suspiciousSessions[0]?.count || 0,
      lockedAccounts: lockedUsers[0]?.count || 0,
      todayFailedLogins: todayFailedLogins[0]?.count || 0,
      recentUploads: recentUploads[0]?.count || 0,
      auditActions: auditActions[0]?.count || 0,
    };
  }

  async getRecentSecurityAlerts(limit = 10): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `(SELECT CAST('suspicious_session' AS CHAR CHARACTER SET utf8mb4) as alert_type, us.id as ref_id,
               CAST(CONCAT(u.full_name, ' suspicious session from ', us.ip_address) AS CHAR CHARACTER SET utf8mb4) as description,
               us.created_at, CAST(us.ip_address AS CHAR CHARACTER SET utf8mb4) as ip_address, CAST('high' AS CHAR CHARACTER SET utf8mb4) as severity
        FROM user_sessions us
        JOIN users u ON u.id = us.user_id
        WHERE us.suspicious = TRUE AND us.is_revoked = FALSE
        ORDER BY us.created_at DESC LIMIT ?)
      UNION ALL
      (SELECT CAST('failed_login' AS CHAR CHARACTER SET utf8mb4) as alert_type, la.id,
              CAST(CONCAT('Failed login from ', la.identifier) AS CHAR CHARACTER SET utf8mb4) as description,
              la.created_at, CAST(la.ip_address AS CHAR CHARACTER SET utf8mb4) as ip_address, CAST('medium' AS CHAR CHARACTER SET utf8mb4) as severity
       FROM login_attempts la
       WHERE la.success = FALSE
       ORDER BY la.created_at DESC LIMIT ?)
      ORDER BY created_at DESC LIMIT ?`,
      [limit, limit, limit]
    );
    return rows as any[];
  }

  async getOrganisationSecurityOverview(): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT o.id, o.name, o.slug, o.is_verified, o.is_active,
              (SELECT COUNT(*) FROM user_roles ur
               JOIN roles r ON r.id = ur.role_id
               WHERE ur.user_id = o.owner_id AND r.slug IN ('super_admin', 'org-admin')) as admin_count,
              (SELECT COUNT(*) FROM users u WHERE u.account_status = 'suspended'
               AND u.id IN (SELECT owner_id FROM organisations WHERE id = o.id)) as locked_users,
               (SELECT COUNT(*) FROM login_attempts la
                WHERE la.identifier COLLATE utf8mb4_unicode_ci IN (SELECT u.full_phone FROM users u WHERE u.id IN
                  (SELECT owner_id FROM organisations WHERE id = o.id))
               AND la.success = FALSE AND la.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as failed_logins_7d,
              (SELECT COUNT(*) FROM audit_logs al WHERE al.entity_type = 'organisation'
               AND al.entity_id = o.id AND al.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) as audit_actions_7d
       FROM organisations o
       ORDER BY failed_logins_7d DESC, audit_actions_7d DESC
       LIMIT 50`
    );
    return rows as any[];
  }

  async getRoleAuditLog(): Promise<any[]> {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT al.*, u.full_name
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       WHERE al.entity_type IN ('role', 'permission', 'user_role')
       ORDER BY al.created_at DESC LIMIT 50`
    );
    return rows as any[];
  }

  getRedisInfo = async (): Promise<any> => {
    const redis = getRedisClient();
    try {
      const info = await redis.info();
      const lines = info.split('\r\n');
      const getVal = (prefix: string): string => {
        const line = lines.find((l: string) => l.startsWith(prefix));
        return line ? line.split(':')[1]?.trim() || '' : '';
      };
      return {
        usedMemory: getVal('used_memory_human'),
        usedMemoryPeak: getVal('used_memory_peak_human'),
        totalConnectionsReceived: getVal('total_connections_received'),
        connectedClients: getVal('connected_clients'),
        uptimeInSeconds: getVal('uptime_in_seconds'),
        keyspaceHits: getVal('keyspace_hits'),
        keyspaceMisses: getVal('keyspace_misses'),
        hitRate: (() => {
          const hits = parseInt(getVal('keyspace_hits')) || 0;
          const misses = parseInt(getVal('keyspace_misses')) || 0;
          const total = hits + misses;
          return total > 0 ? ((hits / total) * 100).toFixed(1) + '%' : 'N/A';
        })(),
      };
    } catch {
      return { error: 'Redis unavailable' };
    }
  };
}

export const securityRepository = new SecurityRepository();
