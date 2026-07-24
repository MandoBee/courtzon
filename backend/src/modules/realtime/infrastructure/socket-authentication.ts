import type { IncomingMessage } from 'node:http';
import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';

const log = createModuleLogger('socket-auth');

export interface SocketAuthResult {
  userId: number;
  roles: string[];
  organisationIds: number[];
  branchIds: number[];
}

export async function authenticateSocket(request: IncomingMessage): Promise<SocketAuthResult | null> {
  try {
    const url = new URL(request.url || '/', 'http://localhost');
    const token = url.searchParams.get('token') || extractBearerToken(request);

    if (!token) return null;

    const pool = getPool();
    const [sessions] = await pool.execute<any[]>(
      `SELECT session_token_hash FROM user_sessions WHERE session_token_hash = SHA2(?, 256) AND is_revoked = FALSE AND expires_at > NOW()`,
      [token],
    );

    if (!sessions.length) {
      const [userRows] = await pool.execute<any[]>(
        'SELECT id FROM users WHERE api_token = ? AND is_active = TRUE AND deleted_at IS NULL',
        [token],
      );
      if (!userRows.length) return null;
      const userId = userRows[0].id;
      return resolveUserData(userId);
    }

    const [userRows] = await pool.execute<any[]>(
      `SELECT us.user_id FROM user_sessions us WHERE us.session_token_hash = SHA2(?, 256) LIMIT 1`,
      [token],
    );
    if (!userRows.length) return null;

    return resolveUserData(userRows[0].user_id);
  } catch (err) {
    log.error({ err }, 'socket.auth_failed');
    return null;
  }
}

function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) return null;
  return auth.slice(7);
}

async function resolveUserData(userId: number): Promise<SocketAuthResult> {
  const pool = getPool();

  const [roleRows] = await pool.execute<any[]>(
    `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND ur.is_active = TRUE`,
    [userId],
  );
  const roles = roleRows.map((r: any) => r.slug);

  const [orgRows] = await pool.execute<any[]>(
    'SELECT organisation_id FROM user_organisations WHERE user_id = ?',
    [userId],
  );
  const organisationIds = orgRows.map((r: any) => r.organisation_id);

  const [branchRows] = await pool.execute<any[]>(
    'SELECT branch_id FROM user_branches WHERE user_id = ?',
    [userId],
  );
  const branchIds = branchRows.map((r: any) => r.branch_id);

  return { userId, roles, organisationIds, branchIds };
}
