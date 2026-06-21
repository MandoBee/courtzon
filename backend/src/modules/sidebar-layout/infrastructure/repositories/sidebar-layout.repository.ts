import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

interface SidebarLayoutRow {
  id: number;
  user_id: number;
  parent_key: string | null;
  ordered_keys: string;
  created_at: string;
  updated_at: string;
}

export class SidebarLayoutRepository {
  private pool: mysql.Pool;
  constructor() { this.pool = getPool(); }

  async findByUser(userId: number): Promise<{ parentKey: string | null; orderedKeys: string[] }[]> {
    const [rows] = await this.pool.execute<RowData>(
      'SELECT parent_key, ordered_keys FROM sidebar_layout WHERE user_id = ? ORDER BY parent_key',
      [userId]
    );
    return (rows as any[]).map((r: any) => ({
      parentKey: (r.parent_key === '' || r.parent_key === null) ? null : r.parent_key,
      orderedKeys: JSON.parse(r.ordered_keys),
    }));
  }

  async upsert(userId: number, parentKey: string | null, orderedKeys: string[]): Promise<void> {
    const dbParentKey = parentKey ?? '';
    await this.pool.execute(
      `INSERT INTO sidebar_layout (user_id, parent_key, ordered_keys)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE ordered_keys = VALUES(ordered_keys)`,
      [userId, dbParentKey, JSON.stringify(orderedKeys)]
    );
  }
}
