import type mysql from 'mysql2/promise';
import { getPool } from '../../../../database/mysql.js';

type RowData = mysql.RowDataPacket[];

function pool() { return getPool(); }

export const cmsRepository = {
  // ── Pages ──

  async listPages() {
    const [rows] = await pool().execute<RowData>(
      'SELECT * FROM cms_pages ORDER BY sort_order ASC, created_at DESC'
    );
    return rows;
  },

  async reorderPages(pageIds: number[]) {
    for (let i = 0; i < pageIds.length; i++) {
      await pool().execute('UPDATE cms_pages SET sort_order = ? WHERE id = ?', [i, pageIds[i]]);
    }
  },

  async getPage(id: number) {
    const [rows] = await pool().execute<RowData>('SELECT * FROM cms_pages WHERE id = ?', [id]);
    if (!rows.length) return null;
    const [sections] = await pool().execute<RowData>(
      'SELECT * FROM cms_sections WHERE page_id = ? ORDER BY sort_order', [id]
    );
    const [blocks] = await pool().execute<RowData>(
      'SELECT * FROM cms_section_blocks WHERE page_id = ? AND is_active = 1 ORDER BY sort_order', [id]
    );
    return { ...rows[0], sections, blocks };
  },

  async getPublishedSlugs() {
    const [rows] = await pool().execute<RowData>(
      'SELECT slug FROM cms_pages WHERE is_published = 1'
    );
    return (rows as mysql.RowDataPacket[]).map((r: any) => r.slug);
  },

  async getPageBySlug(slug: string) {
    const [rows] = await pool().execute<RowData>(
      'SELECT * FROM cms_pages WHERE slug = ? AND is_published = 1', [slug]
    );
    if (!rows.length) return null;
    const page = rows[0];
    const [blocks] = await pool().execute<RowData>(
      'SELECT * FROM cms_section_blocks WHERE page_id = ? AND is_active = 1 ORDER BY sort_order', [page.id]
    );
    return { ...page, blocks };
  },

  async getHomePage() {
    const [rows] = await pool().execute<RowData>(
      'SELECT * FROM cms_pages WHERE is_homepage = 1 AND is_published = 1 LIMIT 1'
    );
    if (!rows.length) return null;
    const page = rows[0];
    const [blocks] = await pool().execute<RowData>(
      'SELECT * FROM cms_section_blocks WHERE page_id = ? AND is_active = 1 ORDER BY sort_order', [page.id]
    );
    return { ...page, blocks };
  },

  async createPage(data: any, userId: number) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_pages (slug, title, content, meta_title, meta_description, is_homepage, page_template)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [data.slug, data.title, data.content || null, data.metaTitle || null, data.metaDescription || null, data.isHomepage ? 1 : 0, data.pageTemplate || null]
    );
    return result.insertId;
  },

  async updatePage(id: number, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      slug: 'slug', title: 'title', content: 'content',
      metaTitle: 'meta_title', metaDescription: 'meta_description',
      isPublished: 'is_published', isHomepage: 'is_homepage',
      pageTemplate: 'page_template'
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool().execute(`UPDATE cms_pages SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async deletePage(id: number) {
    await pool().execute('DELETE FROM cms_section_blocks WHERE page_id = ?', [id]);
    await pool().execute('DELETE FROM cms_sections WHERE page_id = ?', [id]);
    await pool().execute('DELETE FROM cms_pages WHERE id = ?', [id]);
  },

  async publishPage(id: number, publish: boolean) {
    if (publish) {
      await pool().execute('UPDATE cms_pages SET is_published = 1, published_at = NOW() WHERE id = ?', [id]);
    } else {
      await pool().execute('UPDATE cms_pages SET is_published = 0, published_at = NULL WHERE id = ?', [id]);
    }
  },

  // ── Section Blocks ──

  async listBlocks(pageId: number) {
    const [rows] = await pool().execute<RowData>(
      'SELECT * FROM cms_section_blocks WHERE page_id = ? ORDER BY sort_order', [pageId]
    );
    return rows;
  },

  async createBlock(data: any) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_section_blocks (page_id, block_type, block_key, title, subtitle, content, style_config, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.pageId, data.blockType, data.blockKey, data.title || null, data.subtitle || null, data.content ? JSON.stringify(data.content) : null, data.styleConfig ? JSON.stringify(data.styleConfig) : null, data.sortOrder || 0]
    );
    return result.insertId;
  },

  async updateBlock(id: number, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = {
      blockType: 'block_type', blockKey: 'block_key', title: 'title',
      subtitle: 'subtitle', sortOrder: 'sort_order', isActive: 'is_active'
    };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (data.content !== undefined) { fields.push('content = ?'); values.push(JSON.stringify(data.content)); }
    if (data.styleConfig !== undefined) { fields.push('style_config = ?'); values.push(JSON.stringify(data.styleConfig)); }
    if (!fields.length) return;
    values.push(id);
    await pool().execute(`UPDATE cms_section_blocks SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async deleteBlock(id: number) {
    await pool().execute('DELETE FROM cms_section_blocks WHERE id = ?', [id]);
  },

  async reorderBlocks(pageId: number, blockIds: number[]) {
    for (let i = 0; i < blockIds.length; i++) {
      await pool().execute(
        'UPDATE cms_section_blocks SET sort_order = ? WHERE id = ? AND page_id = ?',
        [i, blockIds[i], pageId]
      );
    }
  },

  // ── Blogs ──

  async listBlogs(publishedOnly = false) {
    let sql = `SELECT b.*, u.full_name as author_name FROM cms_blogs b
       LEFT JOIN users u ON u.id = b.author_id`;
    if (publishedOnly) sql += ` WHERE b.is_published = 1`;
    sql += ` ORDER BY b.created_at DESC`;
    const [rows] = await pool().execute<RowData>(sql);
    return rows;
  },

  async getBlog(id: number) {
    const [rows] = await pool().execute<RowData>(
      `SELECT b.*, u.full_name as author_name FROM cms_blogs b
       LEFT JOIN users u ON u.id = b.author_id WHERE b.id = ?`, [id]
    );
    return rows[0] || null;
  },

  async getBlogBySlug(slug: string) {
    const [rows] = await pool().execute<RowData>(
      `SELECT b.*, u.full_name as author_name FROM cms_blogs b
       LEFT JOIN users u ON u.id = b.author_id WHERE b.slug = ? AND b.is_published = 1`, [slug]
    );
    return rows[0] || null;
  },

  async createBlog(data: any, userId: number) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_blogs (slug, title, excerpt, content, cover_image, author_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [data.slug, data.title, data.excerpt || null, data.content || null, data.coverImage || null, userId]
    );
    return result.insertId;
  },

  async updateBlog(id: number, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = { slug: 'slug', title: 'title', excerpt: 'excerpt', content: 'content', coverImage: 'cover_image', isPublished: 'is_published' };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool().execute(`UPDATE cms_blogs SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async deleteBlog(id: number) {
    await pool().execute('DELETE FROM cms_blogs WHERE id = ?', [id]);
  },

  async publishBlog(id: number, publish: boolean) {
    if (publish) {
      await pool().execute('UPDATE cms_blogs SET is_published = 1, published_at = NOW() WHERE id = ?', [id]);
    } else {
      await pool().execute('UPDATE cms_blogs SET is_published = 0, published_at = NULL WHERE id = ?', [id]);
    }
  },

  // ── Sections ──

  async createSection(data: any) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_sections (page_id, section_key, title, content, sort_order)
       VALUES (?, ?, ?, ?, ?)`,
      [data.pageId, data.sectionKey, data.title || null, data.content || null, data.sortOrder || 0]
    );
    return result.insertId;
  },

  async updateSection(id: number, data: any) {
    const fields: string[] = [];
    const values: any[] = [];
    const map: Record<string, string> = { sectionKey: 'section_key', title: 'title', content: 'content', sortOrder: 'sort_order', isActive: 'is_active' };
    for (const [key, col] of Object.entries(map)) {
      if (data[key] !== undefined) { fields.push(`${col} = ?`); values.push(data[key]); }
    }
    if (!fields.length) return;
    values.push(id);
    await pool().execute(`UPDATE cms_sections SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  async deleteSection(id: number) {
    await pool().execute('DELETE FROM cms_sections WHERE id = ?', [id]);
  },

  // ── Media ──

  async listMedia(mediaType?: string, category?: string) {
    let sql = 'SELECT * FROM cms_media WHERE 1=1';
    const params: any[] = [];
    if (mediaType) { sql += ' AND media_type = ?'; params.push(mediaType); }
    if (category) { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY created_at DESC';
    const [rows] = await pool().execute<RowData>(sql, params);
    return rows;
  },

  async createMedia(data: any) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_media (filename, original_name, mime_type, size_bytes, width, height,
        media_type, category, alt_text, url, thumbnail_url, medium_url, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [data.filename, data.originalName, data.mimeType, data.sizeBytes, data.width, data.height,
       data.mediaType, data.category || null, data.altText || null, data.url, data.thumbnailUrl || null, data.mediumUrl || null, data.uploadedBy || null]
    );
    return result.insertId;
  },

  async deleteMedia(id: number) {
    const [rows] = await pool().execute<RowData>('SELECT * FROM cms_media WHERE id = ?', [id]);
    if (rows.length) {
      const { unlink } = await import('node:fs/promises');
      const { join } = await import('node:path');
      const UPLOADS_ROOT = join(import.meta.dirname, '..', '..', '..', '..', 'uploads');
      const file = rows[0];
      const urlToPath = (u: string) => join(UPLOADS_ROOT, u.replace('/uploads/', ''));
      try { await unlink(urlToPath(file.url)); } catch {}
      try { if (file.thumbnail_url) await unlink(urlToPath(file.thumbnail_url)); } catch {}
      try { if (file.medium_url) await unlink(urlToPath(file.medium_url)); } catch {}
    }
    await pool().execute('DELETE FROM cms_media WHERE id = ?', [id]);
  },

  // ── Contact Submissions ──

  async createContactSubmission(data: {
    name: string;
    email: string;
    countryId: number;
    phone: string;
    subject: string;
    subjectOther?: string | null;
    message: string;
    referralSource: string;
    referralOther?: string | null;
  }) {
    const [result] = await pool().execute<mysql.ResultSetHeader & RowData>(
      `INSERT INTO cms_contact_submissions
        (name, email, country_id, phone, subject, subject_other, message, referral_source, referral_other)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.name,
        data.email,
        data.countryId,
        data.phone,
        data.subject,
        data.subjectOther ?? null,
        data.message,
        data.referralSource,
        data.referralOther ?? null,
      ],
    );
    return result.insertId;
  },

  async linkContactAttachment(submissionId: number, uploadId: number, sortOrder: number) {
    await pool().execute(
      `INSERT INTO cms_contact_submission_attachments (submission_id, upload_id, sort_order)
       VALUES (?, ?, ?)`,
      [submissionId, uploadId, sortOrder],
    );
  },

  async markContactEmailSent(id: number) {
    await pool().execute(
      'UPDATE cms_contact_submissions SET email_sent_at = NOW(), email_error = NULL WHERE id = ?',
      [id],
    );
  },

  async markContactEmailFailed(id: number, error: string) {
    await pool().execute(
      'UPDATE cms_contact_submissions SET email_error = ? WHERE id = ?',
      [error, id],
    );
  },

  async listContactSubmissions() {
    const [rows] = await pool().execute<RowData>(
      `SELECT cs.*, c.name AS country_name, c.iso_code AS country_iso
       FROM cms_contact_submissions cs
       LEFT JOIN countries c ON c.id = cs.country_id
       ORDER BY cs.created_at DESC`,
    );
    const submissions = rows as Array<RowData[number] & { id: number }>;
    if (!submissions.length) return submissions;

    const ids = submissions.map((s) => s.id);
    const placeholders = ids.map(() => '?').join(',');
    const [attachRows] = await pool().execute<RowData[]>(
      `SELECT a.submission_id, u.id AS upload_id, u.original_name, u.file_path, u.mime_type
       FROM cms_contact_submission_attachments a
       JOIN uploads u ON u.id = a.upload_id
       WHERE a.submission_id IN (${placeholders})
       ORDER BY a.sort_order`,
      ids,
    );
    const bySubmission = new Map<number, RowData[number][]>();
    for (const row of attachRows as RowData[number][]) {
      const sid = row.submission_id as number;
      if (!bySubmission.has(sid)) bySubmission.set(sid, []);
      bySubmission.get(sid)!.push(row);
    }
    return submissions.map((s) => ({
      ...s,
      attachments: bySubmission.get(s.id) || [],
    }));
  },

  async markContactRead(id: number) {
    await pool().execute('UPDATE cms_contact_submissions SET is_read = 1 WHERE id = ?', [id]);
  },
};
