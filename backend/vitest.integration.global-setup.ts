import mysql from 'mysql2/promise';

/**
 * Vitest global setup for the integration project (TEST-ONLY infrastructure).
 *
 * Most integration specs run against the PERSISTENT local test database
 * (127.0.0.1:3307 / courtzon_v3) instead of an ephemeral Testcontainers DB.
 * Their accounting assertions post real journal entries dated "today", but that
 * database's platform accounting periods only cover past months — so
 * `GlProjectionService.resolvePostingPeriod` throws
 * "No accounting period found for date <today>" and every GL-posting
 * integration times out.
 *
 * This fixture deterministically opens a PLATFORM accounting period
 * (organisation_id IS NULL) covering the current business date when one does
 * not already exist. The row is left in place for the testing campaign; the
 * overall database cleanup is deferred to the separate final-cleanup operation
 * (no destructive table cleanup runs here or on teardown).
 *
 * Safety guarantees:
 *   - The connection target is HARD-CODED to the loopback local test DB. It never
 *     reads DB_* environment variables, so it cannot reach a remote/production DB.
 *   - No accounting business logic, migrations, or seeds are modified.
 *   - If the local DB is unavailable (e.g. a Testcontainers-only filtered run),
 *     the fixture is skipped without failing the run.
 *   - Testcontainers specs get the equivalent period from
 *     `tests/helpers/integration-setup.ts` (their DB is ephemeral).
 */

const LOCAL_TEST_DB = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'courtzon2026',
  database: 'courtzon_v3',
} as const;

let conn: mysql.Connection | null = null;

/** Current business date (YYYY-MM-DD) in a timezone. `en-CA` renders ISO order. */
function businessDateIn(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
}

export async function setup(): Promise<void> {
  try {
    conn = await mysql.createConnection(LOCAL_TEST_DB);
  } catch (err) {
    console.warn(
      `[integration-global-setup] local test DB unavailable — skipping accounting-period fixture (${(err as Error).message})`,
    );
    conn = null;
    return;
  }

  // Mirror the Accounting Engine's platform-timezone resolution
  // (shared/utils/business-date.ts: system_settings.timezone, default Africa/Cairo).
  const [rows] = await conn.execute(
    "SELECT `value` FROM system_settings WHERE `key` = 'timezone' LIMIT 1",
  );
  const timezone = ((rows as any[])[0]?.value as string | undefined)?.trim() || 'Africa/Cairo';
  const businessDate = businessDateIn(timezone);

  // Reuse an existing OPEN platform period that already covers the date.
  const [existing] = await conn.execute(
    `SELECT id FROM accounting_periods
      WHERE organisation_id IS NULL AND status = 'open'
        AND ? BETWEEN start_date AND end_date
      ORDER BY id LIMIT 1`,
    [businessDate],
  );
  if ((existing as any[]).length) {
    console.log(
      `[integration-global-setup] platform open accounting period for ${businessDate} already present (#${(existing as any[])[0].id}) — nothing created`,
    );
    return;
  }

  const [year, month] = businessDate.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10); // last day of month
  const [res] = await conn.execute(
    `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status)
     VALUES (NULL, ?, ?, ?, ?, 'open')`,
    [year, month, start, end],
  );
  const createdPeriodId = Number((res as any).insertId);
  console.log(
    `[integration-global-setup] created platform open accounting period #${createdPeriodId} for ${businessDate} (${start} … ${end}); left in place for the campaign`,
  );
}

export async function teardown(): Promise<void> {
  if (!conn) return;
  // No destructive cleanup: test data is cleared only by the deferred,
  // explicitly authorized final-cleanup operation after the campaign.
  try {
    await conn.end();
  } catch {
    /* ignore */
  }
  conn = null;
}
