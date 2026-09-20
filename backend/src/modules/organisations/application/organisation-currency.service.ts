import { getPool } from '../../../database/mysql.js';

/**
 * Authoritative Tournament/Organisation currency resolution (Group 1A).
 *
 * Precedence:
 *   1. Tournament Branch currency  — `branches.currency_id → currencies.code`
 *   2. Organisation Country default — `organisations.country_id →
 *      countries.default_currency`
 *   3. null (caller decides the system fallback)
 *
 * This is the SINGLE server-side source of truth for an organisation-scoped
 * transaction currency. No new currency tables/columns were added; the schema
 * already models the hierarchy (branches.currency_id is documented as
 * "Override org currency").
 */
export async function resolveOrganisationCurrency(orgId: number, branchId?: number | null): Promise<string | null> {
  const pool = getPool();

  if (branchId != null) {
    const [branchRows] = await pool.execute<any[]>(
      `SELECT c.code AS code
       FROM branches b
       JOIN currencies c ON c.id = b.currency_id
       WHERE b.id = ? AND b.currency_id IS NOT NULL
       LIMIT 1`,
      [branchId],
    );
    if (branchRows.length && branchRows[0].code) return branchRows[0].code;
  }

  if (orgId != null) {
    const [orgRows] = await pool.execute<any[]>(
      `SELECT c.default_currency AS code
       FROM organisations o
       JOIN countries c ON c.id = o.country_id
       WHERE o.id = ? AND c.default_currency IS NOT NULL
       LIMIT 1`,
      [orgId],
    );
    if (orgRows.length && orgRows[0].code) return orgRows[0].code;
  }

  return null;
}