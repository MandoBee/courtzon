/**
 * Self-contained accounting-period fixture for tournament prize integration
 * tests (mirrors the pattern used by booking-settlement / org-journal-entries /
 * gateway-settlement specs): financial postings require an OPEN platform
 * (organisation_id NULL) accounting period covering the CURRENT date. On a
 * month boundary the pre-seeded periods are stale, so these specs seed their
 * own platform period in beforeAll and drop it in afterAll.
 */

export interface PeriodFixturePool {
  execute: (sql: string, params?: any[]) => Promise<[any, any]> | Promise<[any]>;
}

export async function ensureOpenPlatformAccountingPeriod(
  pool: PeriodFixturePool,
): Promise<void> {
  const [rows] = (await pool.execute(
    `SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND CURDATE() BETWEEN start_date AND end_date AND status='open' LIMIT 1`,
  )) as unknown as [Array<{ id: number }>];
  if (rows.length) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  await pool.execute(
    `INSERT INTO accounting_periods (organisation_id, fiscal_year, period_number, start_date, end_date, status)
     VALUES (NULL, ?, ?, ?, ?, 'open')`,
    [year, month, start, end],
  );
}

/** Drop ONLY the platform periods created for the CURRENT month by test runs (idempotent). */
export async function dropCurrentPlatformAccountingPeriods(pool: PeriodFixturePool): Promise<void> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  // CourtZon-book postings reference the platform period via fk_gl_period — clear
  // the GL projections (and ledger rows) for those periods before dropping them.
  await pool.execute(
    `DELETE FROM general_ledger WHERE period_id IN (
       SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND fiscal_year = ? AND period_number = ?
         AND start_date = ? AND end_date = ? AND status = 'open')`,
    [year, month, start, end],
  );
  await pool.execute(
    `DELETE FROM ledger_entries WHERE period_id IN (
       SELECT id FROM accounting_periods WHERE organisation_id IS NULL AND fiscal_year = ? AND period_number = ?
         AND start_date = ? AND end_date = ? AND status = 'open')`,
    [year, month, start, end],
  );
  await pool.execute(
    `DELETE FROM accounting_periods WHERE organisation_id IS NULL AND fiscal_year = ? AND period_number = ?
       AND start_date = ? AND end_date = ? AND status = 'open'`,
    [year, month, start, end],
  );
}