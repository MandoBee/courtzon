import type mysql from 'mysql2/promise';
import { getPool } from '../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

type ThemeSnapshotPayload = {
  shared: Record<string, string>;
  light: Record<string, string>;
  dark: Record<string, string>;
};

function normalizeThemeSnapshot(raw: unknown): ThemeSnapshotPayload {
  const s = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  if (s && typeof s === 'object' && (s as any).v === 2 && (s as any).shared) {
    const v2 = s as ThemeSnapshotPayload & { v: number };
    return { shared: v2.shared || {}, light: v2.light || {}, dark: v2.dark || {} };
  }
  // Legacy flat snapshots: values were stored as current_value (light) only.
  return { shared: {}, light: (s || {}) as Record<string, string>, dark: {} };
}

export const designTokenRepository = {
  async findAll(filters: { page: number; limit: number }) {
    const pool = getPool();
    const [countRows] = await pool.execute<RowData>('SELECT COUNT(*) as cnt FROM design_tokens', []);
    const total = (countRows[0] as any).cnt;
    const offset = (filters.page - 1) * filters.limit;
    const [rows] = await pool.execute<RowData>(
      'SELECT * FROM design_tokens ORDER BY category, token_key ASC LIMIT ? OFFSET ?',
      [filters.limit, offset],
    );
    return { data: rows, total, page: filters.page, limit: filters.limit };
  },

  async findById(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM design_tokens WHERE id = ?', [id]);
    return rows[0] || null;
  },

  async findByKey(key: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>('SELECT * FROM design_tokens WHERE token_key = ?', [key]);
    return rows[0] || null;
  },

  async create(data: { token_key: string; token_type: string; default_value: string; current_value?: string; category?: string; description?: string }) {
    const pool = getPool();
    const [result] = await pool.execute<mysql.ResultSetHeader>(
      `INSERT INTO design_tokens (token_key, token_type, default_value, current_value, category, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.token_key, data.token_type, data.default_value, data.current_value || null, data.category || 'general', data.description || null],
    );
    return result.insertId;
  },

  async update(id: number, data: { token_key?: string; token_type?: string; default_value?: string; current_value?: string; category?: string; description?: string }) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    for (const key of ['token_key', 'token_type', 'default_value', 'current_value', 'category', 'description'] as const) {
      if (data[key] !== undefined) { fields.push(`${key} = ?`); params.push(data[key]); }
    }
    if (!fields.length) return;
    params.push(id);
    await pool.execute(`UPDATE design_tokens SET ${fields.join(', ')} WHERE id = ?`, params);
  },

  async delete(id: number) {
    const pool = getPool();
    await pool.execute('DELETE FROM design_tokens WHERE id = ?', [id]);
  },

  // -- Appearance Studio --------------------------------------------------

  /** Published theme split into shared, light scheme, and dark scheme. */
  async getPublishedThemePayload(): Promise<{ shared: Record<string, string>; light: Record<string, string>; dark: Record<string, string> }> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT token_key, token_type, category,
              COALESCE(current_value, default_value) AS value_light,
              current_value_dark AS value_dark
         FROM design_tokens
        WHERE is_published = 1`,
      [],
    );
    const shared: Record<string, string> = {};
    const light: Record<string, string> = {};
    const dark: Record<string, string> = {};
    for (const r of rows as any[]) {
      const dual = this.isDualModeRow(r);
      if (dual) {
        light[r.token_key] = r.value_light;
        if (r.value_dark) dark[r.token_key] = r.value_dark;
      } else {
        shared[r.token_key] = r.value_light;
      }
    }
    return { shared, light, dark };
  },

  /** Flat map (legacy): shared + light scheme merged. */
  async getPublishedThemeMap(): Promise<Record<string, string>> {
    const { shared, light } = await this.getPublishedThemePayload();
    return { ...shared, ...light };
  },

  isDualModeRow(r: { token_key: string; token_type?: string; category?: string | null }): boolean {
    if (r.token_key.includes('_')) return false;
    const scheme = new Set([
      'color-bg', 'color-surface', 'color-text', 'color-text-muted', 'color-border',
      'color-primary-bg', 'color-success-bg', 'color-success-text', 'color-warning-bg', 'color-warning-text',
      'color-error-bg', 'color-error-text', 'color-info-bg', 'color-info-text',
      'shadow-sm', 'shadow-md', 'shadow-lg', 'shadow-xl',
      'gradient-hero', 'hero-title-color', 'hero-subtitle-color',
    ]);
    if (scheme.has(r.token_key)) return true;
    return r.token_type === 'color' && (r.category === 'semantic' || r.category === 'tint');
  },

  /** All tokens with draft/published/default values, for the editor. */
  async findAllForEditor() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT id, token_key, token_type, category, description,
              default_value, current_value, draft_value,
              current_value_dark, draft_value_dark,
              is_published, role_editable
         FROM design_tokens
        ORDER BY category, token_key ASC`,
      [],
    );
    return rows;
  },

  async getResetBaseline() {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT b.label, b.snapshot, b.saved_at, u.full_name AS saved_by_name
         FROM design_theme_reset_baseline b
         LEFT JOIN users u ON u.id = b.saved_by
        WHERE b.id = 1`,
      [],
    );
    return rows[0] || null;
  },

  async saveResetBaseline(snapshot: ThemeSnapshotPayload | Record<string, string>, savedBy: number | null, label?: string | null) {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO design_theme_reset_baseline (id, label, snapshot, saved_by)
       VALUES (1, ?, ?, ?)
       ON DUPLICATE KEY UPDATE label = VALUES(label), snapshot = VALUES(snapshot), saved_by = VALUES(saved_by)`,
      [label ?? 'Reset default', JSON.stringify('shared' in snapshot && 'light' in snapshot ? { v: 2, ...snapshot } : { v: 2, shared: snapshot, light: {}, dark: {} }), savedBy],
    );
  },

  async restoreResetBaseline(publishedBy: number | null): Promise<void> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT snapshot FROM design_theme_reset_baseline WHERE id = 1',
      [],
    );
    if (!rows.length) throw new Error('No reset baseline saved');
    const raw = (rows[0] as any).snapshot;
    const snapshot = normalizeThemeSnapshot(raw);
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const preState = await this.getPublishedThemePayload();
      await conn.execute(
        'INSERT INTO design_token_versions (label, snapshot, published_by) VALUES (?, ?, ?)',
        ['Auto-snapshot before restore reset baseline', JSON.stringify({ v: 2, ...preState }), publishedBy],
      );
      await this.applyThemeSnapshotOnConn(conn, snapshot);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async saveRoleEditable(flags: Record<string, boolean>) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, enabled] of Object.entries(flags)) {
        await conn.execute(
          'UPDATE design_tokens SET role_editable = ? WHERE token_key = ?',
          [enabled ? 1 : 0, key],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async getRoleEditableKeys(): Promise<string[]> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT token_key FROM design_tokens WHERE role_editable = 1',
      [],
    );
    return (rows as any[]).map((r) => r.token_key);
  },

  async getRoleOverrides(roleId: number): Promise<Record<string, string>> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT token_key, value FROM role_theme_overrides WHERE role_id = ?',
      [roleId],
    );
    const map: Record<string, string> = {};
    for (const r of rows as any[]) map[r.token_key] = r.value;
    return map;
  },

  async saveRoleOverrides(roleId: number, tokens: Record<string, string | null>) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of Object.entries(tokens)) {
        if (value == null || value === '') {
          await conn.execute(
            'DELETE FROM role_theme_overrides WHERE role_id = ? AND token_key = ?',
            [roleId, key],
          );
        } else {
          await conn.execute(
            `INSERT INTO role_theme_overrides (role_id, token_key, value)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE value = VALUES(value)`,
            [roleId, key, value],
          );
        }
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /** First active role (by id) that has appearance.role-customize permission. */
  async getUserAppearanceRoleId(userId: number): Promise<{ roleId: number; roleSlug: string; roleName: string } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT r.id AS role_id, r.slug, r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.deleted_at IS NULL
          AND p.permission_key = 'appearance.role-customize'
        ORDER BY r.id ASC
        LIMIT 1`,
      [userId],
    );
    if (!rows.length) return null;
    const r = rows[0] as any;
    return { roleId: r.role_id, roleSlug: r.slug, roleName: r.name };
  },

  /** Persist draft values for many tokens at once. NULL clears a draft. */
  async saveDrafts(tokens: Record<string, string | null>, tokensDark: Record<string, string | null> = {}) {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const [key, value] of Object.entries(tokens)) {
        await conn.execute(
          'UPDATE design_tokens SET draft_value = ? WHERE token_key = ?',
          [value ?? null, key],
        );
      }
      for (const [key, value] of Object.entries(tokensDark)) {
        await conn.execute(
          'UPDATE design_tokens SET draft_value_dark = ? WHERE token_key = ?',
          [value ?? null, key],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  /** Snapshot current published theme into a version row, then promote drafts. */
  async publish(publishedBy: number | null, label?: string | null): Promise<number> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const prePublish = await this.getPublishedThemePayload();
      const [res] = await conn.execute<mysql.ResultSetHeader>(
        'INSERT INTO design_token_versions (label, snapshot, published_by) VALUES (?, ?, ?)',
        [label ?? null, JSON.stringify({ v: 2, ...prePublish }), publishedBy],
      );

      // Promote drafts -> current, then clear drafts.
      await conn.execute(
        'UPDATE design_tokens SET current_value = draft_value, is_published = 1 WHERE draft_value IS NOT NULL',
      );
      await conn.execute(
        'UPDATE design_tokens SET current_value_dark = draft_value_dark, is_published = 1 WHERE draft_value_dark IS NOT NULL',
      );
      await conn.execute('UPDATE design_tokens SET draft_value = NULL');
      await conn.execute('UPDATE design_tokens SET draft_value_dark = NULL');

      await conn.commit();
      return res.insertId;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async listVersions(limit = 25) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      `SELECT v.id, v.label, v.published_at, v.published_by, u.full_name AS published_by_name
         FROM design_token_versions v
         LEFT JOIN users u ON u.id = v.published_by
        ORDER BY v.published_at DESC
        LIMIT ?`,
      [limit],
    );
    return rows;
  },

  async getVersion(id: number) {
    const pool = getPool();
    const [rows] = await pool.execute<RowData>(
      'SELECT id, label, snapshot, published_at, published_by FROM design_token_versions WHERE id = ?',
      [id],
    );
    return rows[0] || null;
  },

  /** Restore a snapshot into current_value (snapshotting the pre-rollback state first). */
  async rollback(versionId: number, publishedBy: number | null): Promise<void> {
    const pool = getPool();
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [verRows] = await conn.execute<RowData>(
        'SELECT snapshot FROM design_token_versions WHERE id = ?',
        [versionId],
      );
      if (!verRows.length) throw new Error('Version not found');
      const raw = (verRows[0] as any).snapshot;
      const snapshot = normalizeThemeSnapshot(raw);

      const preState = await this.getPublishedThemePayload();
      await conn.execute(
        'INSERT INTO design_token_versions (label, snapshot, published_by) VALUES (?, ?, ?)',
        [`Auto-snapshot before rollback to v${versionId}`, JSON.stringify({ v: 2, ...preState }), publishedBy],
      );

      await this.applyThemeSnapshotOnConn(conn, snapshot);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  },

  async applyThemeSnapshotOnConn(
    conn: mysql.PoolConnection,
    payload: ThemeSnapshotPayload,
  ): Promise<void> {
    for (const [key, value] of Object.entries(payload.shared)) {
      await conn.execute(
        'UPDATE design_tokens SET current_value = ?, draft_value = NULL, is_published = 1 WHERE token_key = ?',
        [value, key],
      );
    }
    for (const [key, value] of Object.entries(payload.light)) {
      await conn.execute(
        'UPDATE design_tokens SET current_value = ?, draft_value = NULL, is_published = 1 WHERE token_key = ?',
        [value, key],
      );
    }
    for (const [key, value] of Object.entries(payload.dark)) {
      await conn.execute(
        'UPDATE design_tokens SET current_value_dark = ?, draft_value_dark = NULL, is_published = 1 WHERE token_key = ?',
        [value, key],
      );
    }
  },
};
