/**
 * Self-contained accounting-period fixture for tournament prize integration
 * tests (mirrors the pattern used by booking-settlement / org-journal-entries /
 * gateway-settlement specs): financial postings require an OPEN platform
 * (organisation_id NULL) accounting period covering the CURRENT date. On a
 * month boundary the pre-seeded periods are stale, so these specs seed their
 * own platform period in beforeAll and drop it in afterAll.
 *
 * OWNERSHIP IS EXPLICIT: `ensureOpenPlatformAccountingPeriod` returns the id of
 * the period it CREATED, or `null` when a suitable period already existed (for
 * example the one opened by the global Vitest setup, or one reused by another
 * suite). Teardown must only ever delete a non-null id returned to the same
 * test — never a shared/global period and never "every period for this month".
 */

export interface PeriodFixturePool {
  execute: (sql: string, params?: any[]) => Promise<[any, any]> | Promise<[any]>;
}

/**
 * Ensure an OPEN platform period covers the database's current date.
 *
 * @returns the id of the period CREATED by this call, or `null` when a
 *          suitable OPEN platform period already existed (nothing was created).
 */
export async function ensureOpenPlatformAccountingPeriod(
  pool: PeriodFixturePool,
): Promise<number | null> {
  const [rows] = (await pool.execute(
    `SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND CURDATE() BETWEEN start_date AND end_date AND status='open' LIMIT 1`,
  )) as unknown as [Array<{ id: number }>];
  if (rows.length) return null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const [result] = (await pool.execute(
    `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status)
     VALUES (NULL, ?, ?, ?, ?, 'open')`,
    [year, month, start, end],
  )) as unknown as [{ insertId?: number }];

  const createdId = Number(result?.insertId);
  return Number.isFinite(createdId) && createdId > 0 ? createdId : null;
}

/**
 * Delete exactly ONE platform period previously created by
 * `ensureOpenPlatformAccountingPeriod`, together with its GL projections and
 * ledger rows (both reference the period through foreign keys).
 *
 * No-op when `createdPeriodId` is null (setup skipped/failed, or the period
 * pre-existed and is owned by the global setup or another suite). Deleting by
 * id — never by date range — guarantees this teardown can only remove the row
 * the same test created.
 */
export async function dropCreatedPlatformAccountingPeriod(
  pool: PeriodFixturePool,
  createdPeriodId: number | null,
): Promise<void> {
  if (createdPeriodId == null) return;
  await pool.execute(`DELETE FROM general_ledger WHERE period_id = ?`, [createdPeriodId]);
  await pool.execute(`DELETE FROM ledger_entries WHERE period_id = ?`, [createdPeriodId]);
  await pool.execute(
    `DELETE FROM accounting_periods WHERE id = ? AND organisation_id IS NULL`,
    [createdPeriodId],
  );
}
