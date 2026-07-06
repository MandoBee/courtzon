import { getPool } from '../../../database/mysql.js';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { createModuleLogger } from '../../../shared/utils/logger.js';

const log = createModuleLogger('ab-testing');

export async function selectVariant(
  eventName: string,
  categorySlug: string,
  userId: number,
): Promise<{
  templateId?: number;
  variant?: 'A' | 'B';
  testId?: number;
}> {
  const pool = getPool();
  const [tests] = await pool.execute<RowDataPacket[]>(
    `SELECT * FROM notification_ab_tests
     WHERE event_name = ? AND category_slug = ? AND is_active = TRUE
     AND (starts_at IS NULL OR starts_at <= NOW())
     AND (ends_at IS NULL OR ends_at >= NOW())
     LIMIT 1`,
    [eventName, categorySlug],
  );

  if (!tests.length) return {};

  const test = tests[0] as any;

  const bucket = userId % 100;
  const variant: 'A' | 'B' = bucket < test.traffic_split ? 'A' : 'B';
  const templateId = variant === 'A' ? test.template_id_a : test.template_id_b;

  return { templateId, variant, testId: test.id };
}

export async function recordAbResult(
  testId: number,
  notificationId: number,
  userId: number,
  variant: 'A' | 'B',
  templateId: number,
  templateVersion?: number,
): Promise<void> {
  try {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO notification_ab_results
       (test_id, notification_id, user_id, variant, template_id, template_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [testId, notificationId, userId, variant, templateId, templateVersion || null],
    );
  } catch (err: any) {
    log.error({ err, testId }, 'Failed to record A/B result');
  }
}

export async function recordAbAction(
  notificationId: number,
  action: string,
): Promise<void> {
  try {
    const pool = getPool();
    await pool.execute(
      `UPDATE notification_ab_results SET action = ? WHERE notification_id = ?`,
      [action, notificationId],
    );
  } catch (err: any) {
    log.error({ err, notificationId }, 'Failed to record A/B action');
  }
}

export async function getAbTestResults(
  testId: number,
): Promise<{
  variantA: { sent: number; opened: number; clicked: number };
  variantB: { sent: number; opened: number; clicked: number };
}> {
  const pool = getPool();
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT variant, action, COUNT(*) as cnt FROM notification_ab_results
     WHERE test_id = ? GROUP BY variant, action`,
    [testId],
  );

  const result = {
    variantA: { sent: 0, opened: 0, clicked: 0 },
    variantB: { sent: 0, opened: 0, clicked: 0 },
  };

  for (const row of rows as any[]) {
    const target = row.variant === 'A' ? result.variantA : result.variantB;
    if (!row.action || row.action === 'sent') target.sent += row.cnt;
    else if (row.action === 'delivered' || row.action === 'read') target.opened += row.cnt;
    else if (row.action === 'clicked') target.clicked += row.cnt;
  }

  return result;
}

export async function createAbTest(
  testKey: string,
  eventName: string,
  categorySlug: string,
  templateIdA: number,
  templateIdB: number,
  trafficSplit: number = 50,
  startsAt?: Date,
  endsAt?: Date,
  createdBy?: number,
): Promise<number> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO notification_ab_tests
     (test_key, template_id_a, template_id_b, category_slug, event_name, traffic_split, starts_at, ends_at, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)`,
    [testKey, templateIdA, templateIdB, categorySlug, eventName, trafficSplit, startsAt || null, endsAt || null, createdBy || null],
  );
  log.info({ testKey, id: result.insertId }, 'A/B test created');
  return result.insertId;
}

export async function getAbTests(
  activeOnly: boolean = false,
): Promise<any[]> {
  const pool = getPool();
  let sql = 'SELECT * FROM notification_ab_tests';
  if (activeOnly) sql += ' WHERE is_active = TRUE';
  sql += ' ORDER BY created_at DESC';
  const [rows] = await pool.execute(sql);
  return rows as any[];
}

export async function toggleAbTest(testId: number, active: boolean): Promise<void> {
  const pool = getPool();
  await pool.execute(
    'UPDATE notification_ab_tests SET is_active = ? WHERE id = ?',
    [active ? 1 : 0, testId],
  );
}
