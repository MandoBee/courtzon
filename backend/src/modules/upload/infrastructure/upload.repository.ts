import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { randomUUID } from 'node:crypto';

export interface UploadRow {
  id: number;
  public_id: string;
  entity_type: string;
  entity_id: number;
  file_category: string;
  original_name: string;
  mime_type: string;
  file_path: string;
  file_size: number;
  width: number | null;
  height: number | null;
  processing_status: 'pending' | 'processing' | 'ready' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface CreateUploadInput {
  entityType: string;
  entityId: number;
  fileCategory: string;
  originalName: string;
  mimeType: string;
  filePath: string;
  fileSize: number;
  width?: number;
  height?: number;
  processingStatus?: string;
}

export const uploadRepository = {
  async create(input: CreateUploadInput): Promise<UploadRow> {
    const pool = getPool();
    const publicId = randomUUID();
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO uploads (public_id, entity_type, entity_id, file_category, original_name,
        mime_type, file_path, file_size, width, height, processing_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        publicId, input.entityType, input.entityId, input.fileCategory,
        input.originalName, input.mimeType, input.filePath, input.fileSize,
        input.width ?? null, input.height ?? null,
        input.processingStatus ?? 'ready',
      ],
    );

    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM uploads WHERE id = ?', [result.insertId],
    );
    return rows[0] as UploadRow;
  },

  async findByEntity(entityType: string, entityId: number, fileCategory?: string): Promise<UploadRow[]> {
    const pool = getPool();
    let sql = 'SELECT * FROM uploads WHERE entity_type = ? AND entity_id = ?';
    const params: (string | number)[] = [entityType, entityId];

    if (fileCategory) {
      sql += ' AND file_category = ?';
      params.push(fileCategory);
    }

    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);
    return rows as UploadRow[];
  },

  async findById(id: number): Promise<UploadRow | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      'SELECT * FROM uploads WHERE id = ?', [id],
    );
    return rows.length > 0 ? (rows[0] as UploadRow) : null;
  },

  async updateStatus(id: number, status: string, errorMessage?: string): Promise<void> {
    const pool = getPool();
    await pool.execute(
      'UPDATE uploads SET processing_status = ?, error_message = ? WHERE id = ?',
      [status, errorMessage ?? null, id],
    );
  },

  async delete(id: number): Promise<void> {
    const pool = getPool();
    await pool.execute('DELETE FROM uploads WHERE id = ?', [id]);
  },

  async deleteByEntity(entityType: string, entityId: number, fileCategory?: string): Promise<number> {
    const pool = getPool();
    let sql = 'DELETE FROM uploads WHERE entity_type = ? AND entity_id = ?';
    const params: (string | number)[] = [entityType, entityId];

    if (fileCategory) {
      sql += ' AND file_category = ?';
      params.push(fileCategory);
    }

    const [result] = await pool.execute<ResultSetHeader>(sql, params);
    return result.affectedRows;
  },
};
