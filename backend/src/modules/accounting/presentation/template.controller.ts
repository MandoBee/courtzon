import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
import { recordAudit } from '../../audit-log/index.js';
import { AppError, NotFoundError } from '../../../shared/errors/app-error.js';
import { coaValidator } from '../../financial/application/coa-validator.service.js';
import mysql from 'mysql2/promise';

type RowData = mysql.RowDataPacket[];

export async function listTemplatesHandler(_request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const [rows] = await pool.execute<RowData>(
    `SELECT * FROM account_templates WHERE is_active = 1 ORDER BY scope DESC, name ASC`
  );
  return reply.send({ data: rows });
}

export async function getTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const [templates] = await pool.execute<RowData>(
    `SELECT * FROM account_templates WHERE id = ?`, [Number(id)]
  );
  if (!templates.length) throw new NotFoundError('Template');
  const [lines] = await pool.execute<RowData>(
    `SELECT * FROM account_template_lines WHERE template_id = ? ORDER BY display_order ASC`,
    [Number(id)]
  );
  return reply.send({ data: { ...(templates as any[])[0], lines } });
}

export async function createTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const organisationId = body.organisationId ? Number(body.organisationId) : null;

  if (!body.name || !body.templateKey) {
    throw new AppError('name and templateKey are required', 400, 'VALIDATION_ERROR');
  }
  if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
    throw new AppError('At least one template line is required', 400, 'VALIDATION_ERROR');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [tResult] = await conn.execute<RowData>(
      `INSERT INTO account_templates (template_key, name, description, scope, organisation_id, created_by)
       VALUES (?, ?, ?, 'organization', ?, ?)`,
      [body.templateKey, body.name, body.description || null, organisationId, userId]
    );
    const templateId = (tResult as any).insertId;

    for (const line of body.lines) {
      if (!line.l3_parent_code || !line.code || !line.name || !line.account_type || !line.normal_side) {
        await conn.rollback();
        throw new AppError('Each template line requires l3_parent_code, code, name, account_type, and normal_side', 400, 'VALIDATION_ERROR');
      }
      await conn.execute(
        `INSERT INTO account_template_lines (template_id, l3_parent_code, code, name, account_type, normal_side, is_postable, description, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [templateId, line.l3_parent_code, line.code, line.name,
         line.account_type, line.normal_side, line.is_postable ?? 1,
         line.description || null, line.display_order || 0]
      );
    }

    await conn.commit();
    recordAudit({ actorId: userId, action: 'ACCOUNTING.TEMPLATE.CREATE', entityType: 'account_templates', entityId: templateId, afterState: { name: body.name, templateKey: body.templateKey }, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
    return reply.status(201).send({ data: { id: templateId } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function updateTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const body = request.body as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM account_templates WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) throw new NotFoundError('Template');
  const tmpl = (existing as any[])[0];
  if (tmpl.scope === 'system') {
    throw new AppError('System templates are immutable', 403, 'FORBIDDEN');
  }

  await pool.execute(
    `UPDATE account_templates SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?`,
    [body.name ?? null, body.description ?? null, Number(id)]
  );

  if (body.lines && Array.isArray(body.lines)) {
    await pool.execute(`DELETE FROM account_template_lines WHERE template_id = ?`, [Number(id)]);
    for (const line of body.lines) {
      await pool.execute(
        `INSERT INTO account_template_lines (template_id, l3_parent_code, code, name, account_type, normal_side, is_postable, description, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [Number(id), line.l3_parent_code, line.code, line.name,
         line.account_type, line.normal_side, line.is_postable ?? 1,
         line.description || null, line.display_order || 0]
      );
    }
  }

  recordAudit({ actorId: userId, action: 'ACCOUNTING.TEMPLATE.UPDATE', entityType: 'account_templates', entityId: Number(id), afterState: { name: body.name }, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
  return reply.send({ data: { id: Number(id) } });
}

export async function deactivateTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { id } = request.params as any;
  const userId = (request as any).userId;

  const [existing] = await pool.execute<RowData>(
    `SELECT * FROM account_templates WHERE id = ?`, [Number(id)]
  );
  if (!existing.length) throw new NotFoundError('Template');
  const tmpl = (existing as any[])[0];
  if (tmpl.scope === 'system') {
    throw new AppError('System templates cannot be deactivated', 403, 'FORBIDDEN');
  }

  await pool.execute(`UPDATE account_templates SET is_active = 0 WHERE id = ?`, [Number(id)]);
  recordAudit({ actorId: userId, action: 'ACCOUNTING.TEMPLATE.DEACTIVATE', entityType: 'account_templates', entityId: Number(id), ipAddress: request.ip, userAgent: request.headers['user-agent'] });
  return reply.send({ data: { id: Number(id), is_active: 0 } });
}

export async function previewTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const { templateId, organisationId } = request.query as any;
  if (!templateId || !organisationId) {
    throw new AppError('templateId and organisationId query params are required', 400, 'VALIDATION_ERROR');
  }

  const [lines] = await pool.execute<RowData>(
    `SELECT * FROM account_template_lines WHERE template_id = ? ORDER BY display_order ASC`,
    [Number(templateId)]
  );
  if (!lines.length) throw new NotFoundError('Template or template lines');

  const orgId = Number(organisationId);
  const preview: any[] = [];
  for (const line of lines as any[]) {
    const l3ParentId = await resolveL3Parent(pool, line.l3_parent_code);
    const finalCode = await generateOrgCode(pool, orgId, line.code);
    const exists = await checkAccountExists(pool, orgId, finalCode);
    preview.push({
      template_line_id: line.id,
      l3_parent_code: line.l3_parent_code,
      l3_parent_id: l3ParentId,
      proposed_code: finalCode,
      name: line.name,
      account_type: line.account_type,
      normal_side: line.normal_side,
      is_postable: !!line.is_postable,
      description: line.description,
      already_exists: exists,
      status: exists ? 'skipped' : 'will_create',
    });
  }
  return reply.send({ data: preview });
}

export async function applyTemplateHandler(request: FastifyRequest, reply: FastifyReply) {
  const pool = getPool();
  const body = request.body as any;
  const userId = (request as any).userId;
  const templateId = Number(body.templateId);
  const orgId = Number(body.organisationId);

  if (!templateId || !orgId) {
    throw new AppError('templateId and organisationId are required', 400, 'VALIDATION_ERROR');
  }

  const [orgCheck] = await pool.execute<RowData>(
    `SELECT id FROM organisations WHERE id = ? AND is_active = 1 AND deleted_at IS NULL`, [orgId]
  );
  if (!orgCheck.length) throw new NotFoundError('Organisation');

  const [lines] = await pool.execute<RowData>(
    `SELECT * FROM account_template_lines WHERE template_id = ? ORDER BY display_order ASC`,
    [templateId]
  );
  if (!lines.length) throw new NotFoundError('Template or template lines');

  const conn = await pool.getConnection();
  const created: number[] = [];
  const skipped: { code: string; name: string }[] = [];
  try {
    await conn.beginTransaction();

    for (const line of lines as any[]) {
      const l3ParentId = await coaValidator.validateTemplateParent(line.l3_parent_code, 'Template Apply');
      const finalCode = await generateOrgCode(conn, orgId, line.code);
      const exists = await checkAccountExists(conn, orgId, finalCode);
      if (exists) {
        skipped.push({ code: finalCode, name: line.name });
        continue;
      }

      const [result] = await conn.execute<RowData>(
        `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
         VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?)`,
        [orgId, finalCode, line.name, line.account_type, line.normal_side,
         l3ParentId, line.description || null]
      );
      created.push((result as any).insertId);
    }

    await conn.commit();
    recordAudit({ actorId: userId, action: 'ACCOUNTING.TEMPLATE.APPLY', entityType: 'account_templates', entityId: templateId, afterState: { organisationId: orgId, created: created.length, skipped: skipped.length }, ipAddress: request.ip, userAgent: request.headers['user-agent'] });
    return reply.send({ data: { created: created.length, skipped: skipped.length, skipped_accounts: skipped, created_ids: created } });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

async function resolveL3Parent(db: mysql.Pool | mysql.PoolConnection, l3Code: string): Promise<number | null> {
  const [rows] = await db.execute<RowData>(
    `SELECT id FROM chart_of_accounts WHERE code = ? AND organisation_id IS NULL AND is_active = 1 LIMIT 1`,
    [l3Code]
  );
  return rows.length ? (rows as any[])[0].id : null;
}

async function generateOrgCode(db: mysql.Pool | mysql.PoolConnection, orgId: number, baseCode: string): Promise<string> {
  const [existing] = await db.execute<RowData>(
    `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ?`, [orgId, baseCode]
  );
  if (!existing.length) return baseCode;
  // Append suffix if collides
  let suffix = 1;
  let candidate = `${baseCode}-${suffix}`;
  while (true) {
    const [check] = await db.execute<RowData>(
      `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ?`, [orgId, candidate]
    );
    if (!check.length) return candidate;
    suffix++;
    candidate = `${baseCode}-${suffix}`;
  }
}

async function checkAccountExists(db: mysql.Pool | mysql.PoolConnection, orgId: number, code: string): Promise<boolean> {
  const [rows] = await db.execute<RowData>(
    `SELECT 1 FROM chart_of_accounts WHERE organisation_id = ? AND code = ? LIMIT 1`,
    [orgId, code]
  );
  return rows.length > 0;
}
