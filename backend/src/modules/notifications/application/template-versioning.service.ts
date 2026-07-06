import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('template-versioning');

export async function publishTemplateVersion(
  templateId: number,
  changedBy?: number,
  changeSummary?: string,
): Promise<void> {
  const pool = getPool();

  const [existing] = await pool.execute<RowDataPacket[]>(
    'SELECT * FROM notification_templates WHERE id = ?',
    [templateId],
  );
  if (!existing.length) throw new Error(`Template ${templateId} not found`);

  const tpl = existing[0] as any;
  const newVersion = (tpl.version || 1) + 1;

  await pool.execute(
    `INSERT INTO notification_template_versions
     (template_id, version, title_template, body_template, action_key, route_pattern, image_url, actions, changed_by, change_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      templateId,
      newVersion,
      tpl.title_template,
      tpl.body_template,
      tpl.action_key,
      tpl.route_pattern,
      tpl.image_url,
      tpl.actions,
      changedBy || null,
      changeSummary || null,
    ],
  );

  await pool.execute(
    'UPDATE notification_templates SET version = ?, published_at = NOW() WHERE id = ?',
    [newVersion, templateId],
  );

  log.info({ templateId, newVersion }, 'Template version published');
}

export async function rollbackTemplate(
  templateId: number,
  targetVersion: number,
  changedBy?: number,
): Promise<void> {
  const pool = getPool();

  const [version] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM notification_template_versions
     WHERE template_id = ? AND version = ?
     LIMIT 1`,
    [templateId, targetVersion],
  );
  if (!version.length) throw new Error(`Template version ${templateId}:${targetVersion} not found`);

  const v = version[0] as any;

  await pool.execute(
    `UPDATE notification_templates SET
     title_template = ?, body_template = ?, action_key = ?,
     route_pattern = ?, image_url = ?, actions = ?
     WHERE id = ?`,
    [v.title_template, v.body_template, v.action_key, v.route_pattern, v.image_url, v.actions, templateId],
  );

  await publishTemplateVersion(templateId, changedBy, `Rollback to version ${targetVersion}`);
  log.info({ templateId, targetVersion }, 'Template rolled back');
}

export async function getTemplateVersions(templateId: number): Promise<any[]> {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT * FROM notification_template_versions
     WHERE template_id = ?
     ORDER BY version DESC`,
    [templateId],
  );
  return rows as any[];
}

export async function updateTemplate(
  templateId: number,
  updates: {
    titleTemplate?: string;
    bodyTemplate?: string;
    actionKey?: string;
    routePattern?: string;
    imageUrl?: string;
    actions?: any;
  },
  changedBy?: number,
): Promise<void> {
  const pool = getPool();
  const setParts: string[] = [];
  const params: any[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const col = camelToSnake(key);
    setParts.push(`${col} = ?`);
    params.push(value);
  }

  if (!setParts.length) return;

  params.push(templateId);
  await pool.execute(
    `UPDATE notification_templates SET ${setParts.join(', ')} WHERE id = ?`,
    params,
  );

  await publishTemplateVersion(templateId, changedBy, 'Template updated');
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
