import { getPool } from '../../../../database/mysql.js';
import { createHash, randomBytes } from 'node:crypto';

type RowData = import('mysql2').RowDataPacket[];
type ResultSet = import('mysql2').ResultSetHeader;

class ApiKeyRepository {
  async create(data: { organisation_id?: number; user_id: number; name: string; rate_limit?: number; scopes?: string[] }): Promise<{ id: number; plainKey: string }> {
    const pool = getPool();
    const rawKey = `cz_${randomBytes(32).toString('hex')}`;
    const hash = createHash('sha256').update(rawKey).digest('hex');
    const prefix = rawKey.substring(0, 20);

    const [result] = await pool.execute<ResultSet>(
      'INSERT INTO api_keys (organisation_id, user_id, name, key_hash, key_prefix, scopes, rate_limit) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [data.organisation_id ?? null, data.user_id, data.name, hash, prefix,
       data.scopes ? JSON.stringify(data.scopes) : null, data.rate_limit ?? 100],
    );
    return { id: (result as any).insertId, plainKey: rawKey };
  }

  async findByKeyHash(hash: string): Promise<any | null> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > NOW()) LIMIT 1', [hash],
    );
    return rows.length ? rows[0] : null;
  }

  async findByUser(userId: number): Promise<any[]> {
    const [rows] = await getPool().execute<RowData>(
      'SELECT id, name, key_prefix, rate_limit, scopes, is_active, last_used_at, created_at FROM api_keys WHERE user_id = ? ORDER BY created_at DESC', [userId],
    );
    return rows;
  }

  async revoke(id: number, userId: number): Promise<void> {
    await getPool().execute('UPDATE api_keys SET is_active = 0 WHERE id = ? AND user_id = ?', [id, userId]);
  }

  async updateLastUsed(id: number): Promise<void> {
    await getPool().execute('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [id]);
  }
}

export const apiKeyRepository = new ApiKeyRepository();
