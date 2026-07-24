import { createModuleLogger } from '../../../shared/utils/logger.js';
import { getPool } from '../../../database/mysql.js';

const log = createModuleLogger('socket-room');

export class SocketRoomManager {
  async resolveRoomsForUser(userId: number): Promise<string[]> {
    const pool = getPool();
    const rooms: string[] = [`user:${userId}`];

    try {
      const [orgRows] = await pool.execute<any[]>(
        'SELECT organisation_id FROM user_organisations WHERE user_id = ?',
        [userId],
      );
      for (const row of orgRows) {
        rooms.push(`organisation:${row.organisation_id}`);
      }

      const [branchRows] = await pool.execute<any[]>(
        `SELECT ub.branch_id FROM user_branches ub WHERE ub.user_id = ?`,
        [userId],
      );
      for (const row of branchRows) {
        rooms.push(`branch:${row.branch_id}`);
      }

      const [roleRows] = await pool.execute<any[]>(
        `SELECT r.slug FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND ur.is_active = TRUE`,
        [userId],
      );
      let isSuperAdmin = false;
      for (const row of roleRows) {
        if (row.slug === 'super_admin' || row.slug === 'super-admin') {
          rooms.push('superadmin');
          rooms.push('finance');
          isSuperAdmin = true;
        }
      }

      if (!isSuperAdmin) {
        rooms.push('player');
      }
    } catch (err) {
      log.error({ err, userId }, 'room.resolve_failed');
    }

    return rooms;
  }
}

export const socketRoomManager = new SocketRoomManager();
