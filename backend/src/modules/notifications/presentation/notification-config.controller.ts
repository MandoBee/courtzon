import type { FastifyRequest, FastifyReply } from 'fastify';
import { getPool } from '../../../database/mysql.js';
type RowData = import('mysql2').RowDataPacket[];

const pool = getPool();

// ── Global Settings ──

export async function getGlobalSettingsHandler(_req: FastifyRequest, reply: FastifyReply) {
  const [rows] = await pool.execute<RowData>('SELECT * FROM notification_global_settings ORDER BY setting_key');
  return reply.send({ data: rows });
}

export async function updateGlobalSettingHandler(req: FastifyRequest, reply: FastifyReply) {
  const { key } = req.params as any;
  const { value } = req.body as any;
  if (value === undefined) return reply.status(400).send({ error: 'value is required' });
  await pool.execute(
    'INSERT INTO notification_global_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
    [key, String(value)],
  );
  return reply.send({ success: true });
}

// ── Retry Policies ──

export async function getRetryPoliciesHandler(_req: FastifyRequest, reply: FastifyReply) {
  const [rows] = await pool.execute<RowData>('SELECT * FROM notification_retry_policies ORDER BY id');
  return reply.send({ data: rows });
}

export async function updateRetryPolicyHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const body = req.body as any;
  const fields: string[] = [];
  const params: any[] = [];
  const map: Record<string, string> = { policyKey: 'policy_key', categorySlug: 'category_slug', maxRetries: 'max_retries', retryDelayMs: 'retry_delay_ms', exponentialBackoff: 'exponential_backoff', maxDelayMs: 'max_delay_ms', isActive: 'is_active' };
  for (const [k, c] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${c} = ?`); params.push(body[k]); }
  }
  if (fields.length) { params.push(Number(id)); await pool.execute(`UPDATE notification_retry_policies SET ${fields.join(', ')} WHERE id = ?`, params); }
  return reply.send({ success: true });
}

export async function createRetryPolicyHandler(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as any;
  const [result] = await pool.execute(
    `INSERT INTO notification_retry_policies (policy_key, category_slug, max_retries, retry_delay_ms, exponential_backoff, max_delay_ms, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [body.policyKey, body.categorySlug || null, body.maxRetries || 3, body.retryDelayMs || 30000, body.exponentialBackoff !== undefined ? body.exponentialBackoff : 1, body.maxDelayMs || 300000, body.isActive !== undefined ? body.isActive : 1],
  );
  return reply.status(201).send({ id: (result as any).insertId });
}

export async function deleteRetryPolicyHandler(req: FastifyRequest, reply: FastifyReply) {
  await pool.execute('DELETE FROM notification_retry_policies WHERE id = ?', [Number((req.params as any).id)]);
  return reply.status(204).send();
}

// ── Notification Rules ──

export async function getRulesHandler(_req: FastifyRequest, reply: FastifyReply) {
  const [rules] = await pool.execute<RowData>(
    `SELECT r.*, (SELECT JSON_ARRAYAGG(JSON_OBJECT('id', c.id, 'field', c.field, 'operator', c.operator, 'value', c.value))
      FROM notification_rule_conditions c WHERE c.rule_id = r.id) AS conditions
     FROM notification_rules r ORDER BY r.priority, r.id`,
  );
  return reply.send({ data: rules });
}

export async function updateRuleHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const body = req.body as any;
  const fields: string[] = [];
  const params: any[] = [];
  const map: Record<string, string> = { name: 'name', description: 'description', eventName: 'event_name', categorySlug: 'category_slug', isActive: 'is_active', priority: 'priority', action: 'action', actionData: 'action_data' };
  for (const [k, c] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${c} = ?`); params.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]); }
  }
  if (fields.length) { params.push(Number(id)); await pool.execute(`UPDATE notification_rules SET ${fields.join(', ')} WHERE id = ?`, params); }
  if (body.conditions) {
    await pool.execute('DELETE FROM notification_rule_conditions WHERE rule_id = ?', [Number(id)]);
    for (const c of body.conditions) {
      await pool.execute('INSERT INTO notification_rule_conditions (rule_id, field, operator, value) VALUES (?, ?, ?, ?)', [Number(id), c.field, c.operator, c.value]);
    }
  }
  return reply.send({ success: true });
}

export async function createRuleHandler(req: FastifyRequest, reply: FastifyReply) {
  const body = req.body as any;
  const [result] = await pool.execute(
    `INSERT INTO notification_rules (name, description, event_name, category_slug, is_active, priority, action, action_data)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.name, body.description || null, body.eventName || null, body.categorySlug || null, body.isActive !== undefined ? body.isActive : 1, body.priority || 100, body.action, body.actionData ? JSON.stringify(body.actionData) : null],
  );
  if (body.conditions?.length) {
    for (const c of body.conditions) {
      await pool.execute('INSERT INTO notification_rule_conditions (rule_id, field, operator, value) VALUES (?, ?, ?, ?)', [(result as any).insertId, c.field, c.operator, c.value]);
    }
  }
  return reply.status(201).send({ id: (result as any).insertId });
}

export async function deleteRuleHandler(req: FastifyRequest, reply: FastifyReply) {
  await pool.execute('DELETE FROM notification_rules WHERE id = ?', [Number((req.params as any).id)]);
  return reply.status(204).send();
}

// ── Providers ──

export async function getProvidersHandler(_req: FastifyRequest, reply: FastifyReply) {
  const [rows] = await pool.execute<RowData>('SELECT * FROM notification_providers ORDER BY priority, slug');
  return reply.send({ data: rows });
}

export async function updateProviderHandler(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as any;
  const body = req.body as any;
  const fields: string[] = [];
  const params: any[] = [];
  const map: Record<string, string> = { isEnabled: 'is_enabled', priority: 'priority', config: 'config' };
  for (const [k, c] of Object.entries(map)) {
    if (body[k] !== undefined) { fields.push(`${c} = ?`); params.push(typeof body[k] === 'object' ? JSON.stringify(body[k]) : body[k]); }
  }
  if (fields.length) { params.push(Number(id)); await pool.execute(`UPDATE notification_providers SET ${fields.join(', ')} WHERE id = ?`, params); }
  return reply.send({ success: true });
}
