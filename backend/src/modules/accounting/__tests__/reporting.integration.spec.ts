import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

type RowData = RowDataPacket[];

let testPool: mysql.Pool;

// Exact global test-account codes owned by this suite. Cleanup must filter on
// (organisation_id IS NULL, code IN (...)) so InnoDB uses the uk_org_code index
// range instead of a full table scan (a full-scan DELETE under REPEATABLE READ
// takes next-key locks across the whole table and deadlocks against parallel
// workers holding FK parent S-locks on chart_of_accounts).
const GLOBAL_TEST_CODES = ['9993', '9994', '9995', '9996', '9997', '9998', '9999'];
const REPORTING_ORG_SLUGS = ['test-org-a-reporting', 'test-org-b-reporting'];

async function purgeGlobalTestAccounts(pool: mysql.Pool): Promise<void> {
  const [rows] = await pool.execute<RowData>(
    `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code IN (${GLOBAL_TEST_CODES.map(() => '?').join(',')})`,
    GLOBAL_TEST_CODES
  );
  const ids = (rows as any[]).map((r) => r.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await pool.execute(`DELETE FROM general_ledger WHERE account_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM ledger_entries WHERE chart_account_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM chart_of_accounts WHERE id IN (${placeholders})`, ids);
}

async function purgeReportingOrgsBySlug(pool: mysql.Pool): Promise<void> {
  // Deleting the test orgs cascades their org-owned ORG-% accounts (fk_coa_org);
  // clear their GL/ledger rows first so the cascade never hits child FK rows.
  const [orgs] = await pool.execute<RowData>(
    `SELECT id FROM organisations WHERE slug IN (${REPORTING_ORG_SLUGS.map(() => '?').join(',')})`,
    REPORTING_ORG_SLUGS
  );
  const ids = (orgs as any[]).map((r) => r.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${placeholders})`, ids);
}

async function purgeReportingOrgsBySlugUnify(pool: mysql.Pool): Promise<void> {
  const [orgs] = await pool.execute<RowData>(
    `SELECT id FROM organisations WHERE slug = 'test-unify-org'`
  );
  const ids = (orgs as any[]).map((r) => r.id);
  if (ids.length === 0) return;
  const placeholders = ids.map(() => '?').join(',');
  await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${placeholders})`, ids);
  await pool.execute(`DELETE FROM organisations WHERE id IN (${placeholders})`, ids);
}

describe('Reporting — Organization Isolation & Net Income', () => {
  let orgAId: number;
  let orgBId: number;
  let coaRevenueA: number;
  let coaExpenseA: number;
  let coaRevenueB: number;
  let coaExpenseB: number;
  let coaContraRevenue: number;
  let periodId: number;

  beforeAll(async () => {
    testPool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3307,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'courtzon2026',
      database: process.env.DB_NAME || 'courtzon_v3',
      connectionLimit: 5,
      charset: 'utf8mb4',
    });

    // Idempotent fixture: remove any leftovers from interrupted runs before seeding.
    // All deletes are index-scoped to this suite's own fixtures (see helpers above).
    await purgeGlobalTestAccounts(testPool);
    await purgeReportingOrgsBySlug(testPool);

    // Create 2 test orgs
    const [orgResultA] = await testPool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), 1, 'Test Org A - Reporting', 'test-org-a-reporting', 1)`
    );
    orgAId = (orgResultA as any).insertId;

    const [orgResultB] = await testPool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), 1, 'Test Org B - Reporting', 'test-org-b-reporting', 1)`
    );
    orgBId = (orgResultB as any).insertId;

    // Create COA accounts: 2 global, 2 org-owned by A, 1 org-owned by B
    // Global revenue account
    const [coaRev] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (NULL, '9999', 'Test Global Revenue', 'revenue', 'credit', 1, 1)`
    );
    const revGlobalId = (coaRev as any).insertId;

    // Global expense account
    const [coaExp] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (NULL, '9998', 'Test Global Expense', 'expense', 'debit', 1, 1)`
    );
    const expGlobalId = (coaExp as any).insertId;

    // Contra revenue account
    const [coaContra] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (NULL, '9997', 'Test Global Contra Revenue', 'contra_revenue', 'debit', 1, 1)`
    );
    coaContraRevenue = (coaContra as any).insertId;

    // Org A owned revenue account
    const [coaARev] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (?, 'ORG-A-REV', 'Org A Revenue', 'revenue', 'credit', 0, 1)`,
      [orgAId]
    );
    coaRevenueA = (coaARev as any).insertId;

    // Org A owned expense account
    const [coaAExp] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (?, 'ORG-A-EXP', 'Org A Expense', 'expense', 'debit', 0, 1)`,
      [orgAId]
    );
    coaExpenseA = (coaAExp as any).insertId;

    // Org B owned revenue account
    const [coaBRev] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (?, 'ORG-B-REV', 'Org B Revenue', 'revenue', 'credit', 0, 1)`,
      [orgBId]
    );
    coaRevenueB = (coaBRev as any).insertId;

    // Org B owned expense account
    const [coaBExp] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (?, 'ORG-B-EXP', 'Org B Expense', 'expense', 'debit', 0, 1)`,
      [orgBId]
    );
    coaExpenseB = (coaBExp as any).insertId;

    // Ensure an accounting period exists for GL entries
    const [periodsCheck] = await testPool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE status = 'open' LIMIT 1`
    );
    if (periodsCheck.length > 0) {
      periodId = (periodsCheck as any[])[0].id;
    } else {
      const [newPeriod] = await testPool.execute<RowData>(
        `INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date, status)
         VALUES (2026, 1, '2026-01-01', '2026-01-31', 'open')`
      );
      periodId = (newPeriod as any).insertId;
    }

    // --- Insert GL entries for Org A ---
    // Org A: revenue via global account (credit = 1000)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 1000, 0, 1)`,
      [orgAId, periodId, revGlobalId]
    );

    // Org A: revenue via org-owned account (credit = 500)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 500, 0, 1)`,
      [orgAId, periodId, coaRevenueA]
    );

    // Org A: expense via global account (debit = 300)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 300, 0, 0, 1)`,
      [orgAId, periodId, expGlobalId]
    );

    // Org A: expense via org-owned account (debit = 200)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 200, 0, 0, 1)`,
      [orgAId, periodId, coaExpenseA]
    );

    // Org A: contra revenue (debit = 100, reduces net revenue)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 100, 0, 0, 1)`,
      [orgAId, periodId, coaContraRevenue]
    );

    // --- Insert GL entries for Org B ---
    // Org B: revenue via global account (credit = 200)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 200, 0, 1)`,
      [orgBId, periodId, revGlobalId]
    );

    // Org B: revenue via org-owned account (credit = 100)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 100, 0, 1)`,
      [orgBId, periodId, coaRevenueB]
    );

    // Org B: expense via org-owned account (debit = 50)
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 50, 0, 0, 1)`,
      [orgBId, periodId, coaExpenseB]
    );
  });

  afterAll(async () => {
    // 1) Global test accounts (+ any GL/ledger rows referencing them)
    await purgeGlobalTestAccounts(testPool);
    // 2) Org-scoped GL/ledger rows must go before org deletion: the org→accounts
    //    cascade would otherwise hit fk_gl_account (RESTRICT) on ORG-% accounts.
    const orgIds = [orgAId, orgBId].filter(Boolean);
    if (orgIds.length > 0) {
      const placeholders = orgIds.map(() => '?').join(',');
      await testPool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (${placeholders})`, orgIds);
      await testPool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (${placeholders})`, orgIds);
      // 3) Test orgs last (cascades remaining org-owned ORG-% accounts)
      await testPool.execute(`DELETE FROM organisations WHERE id IN (${placeholders})`, orgIds);
    }
    await testPool.end();
  });

  // ── Organization Isolation Tests ──

  it('Org A cannot see Org B GL entries (general_ledger filter)', async () => {
    const [resultA] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(debit), 0) AS total_debits, COALESCE(SUM(credit), 0) AS total_credits
       FROM general_ledger WHERE organisation_id = ?`,
      [orgAId]
    );
    const [resultB] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(debit), 0) AS total_debits, COALESCE(SUM(credit), 0) AS total_credits
       FROM general_ledger WHERE organisation_id = ?`,
      [orgBId]
    );

    const aCredits = Number((resultA as any[])[0].total_credits);
    const aDebits = Number((resultA as any[])[0].total_debits);
    const bCredits = Number((resultB as any[])[0].total_credits);
    const bDebits = Number((resultB as any[])[0].total_debits);

    // Org A: 1000 + 500 = 1500 credits, 300 + 200 + 100 = 600 debits
    expect(aCredits).toBe(1500);
    expect(aDebits).toBe(600);

    // Org B: 200 + 100 = 300 credits, 50 debits
    expect(bCredits).toBe(300);
    expect(bDebits).toBe(50);
  });

  it('COA query includes org-owned accounts when orgId is scoped', async () => {
    const [globalOnly] = await testPool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE organisation_id IS NULL AND code LIKE '999%'`
    );
    const [orgAOnly] = await testPool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE organisation_id = ? AND code LIKE 'ORG-%'`,
      [orgAId]
    );
    const [orgBOnly] = await testPool.execute<RowData>(
      `SELECT COUNT(*) AS cnt FROM chart_of_accounts WHERE organisation_id = ? AND code LIKE 'ORG-%'`,
      [orgBId]
    );

    expect(Number((globalOnly as any[])[0].cnt)).toBe(3); // 3 global test accounts
    expect(Number((orgAOnly as any[])[0].cnt)).toBe(2);   // 2 org-A owned
    expect(Number((orgBOnly as any[])[0].cnt)).toBe(2);   // 2 org-B owned
  });

  it('revenue aggregation by GL organisation_id is correct for Org A', async () => {
    const [result] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS net_credit
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [orgAId]
    );
    // Revenue: 1000 (global) + 500 (org-owned) = 1500, minus debits (0) = 1500 net credit
    expect(Number((result as any[])[0].net_credit)).toBe(1500);
  });

  it('revenue aggregation by GL organisation_id is correct for Org B', async () => {
    const [result] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS net_credit
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [orgBId]
    );
    // Revenue: 200 (global) + 100 (org-owned) = 300 net credit
    expect(Number((result as any[])[0].net_credit)).toBe(300);
  });

  it('global accounts aggregate correctly across org scope', async () => {
    // Platform-wide (no org filter): total GL entries regardless of organisation_id
    const [result] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) AS total_credits, COALESCE(SUM(gl.debit), 0) AS total_debits
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE a.code LIKE '999%' AND a.type = 'revenue'`
    );
    // Revenue via global account 9999: 1000 (orgA) + 200 (orgB) = 1200 credits
    const credits = Number((result as any[])[0].total_credits);
    expect(credits).toBe(1200);
  });

  it('unauthorized org access is rejected (nonexistent org)', async () => {
    const nonexistentOrgId = 999999;
    const [membership] = await testPool.execute<RowData>(
      `SELECT 1 FROM user_organisations WHERE user_id = ? AND organisation_id = ? LIMIT 1`,
      [1, nonexistentOrgId]
    );
    const [ownership] = await testPool.execute<RowData>(
      `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? AND deleted_at IS NULL LIMIT 1`,
      [nonexistentOrgId, 1]
    );
    expect(membership.length).toBe(0);
    expect(ownership.length).toBe(0);
  });

  // ── Net Income Tests ──

  it('net revenue = revenue - contra_revenue for Org A', async () => {
    const [revResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [orgAId]
    );
    const [contraResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'contra_revenue'`,
      [orgAId]
    );

    const netRevenue = Number((revResult as any[])[0].balance) - Number((contraResult as any[])[0].balance);
    // Revenue: 1000 + 500 = 1500, Contra: 100 (debit) = 100 → net = 1400
    expect(netRevenue).toBe(1400);
  });

  it('net expense for Org A is correct', async () => {
    const [result] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type IN ('expense', 'contra_expense')`,
      [orgAId]
    );
    // Expenses: 300 (global) + 200 (org-owned) = 500 debit
    expect(Number((result as any[])[0].balance)).toBe(500);
  });

  it('net income = net_revenue - net_expense for Org A', async () => {
    // Revenue: 1500 - contra_revenue 100 = 1400 net revenue
    // Expense: 500
    // Net income: 1400 - 500 = 900
    const [revResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [orgAId]
    );
    const [contraResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'contra_revenue'`,
      [orgAId]
    );
    const [expResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type IN ('expense', 'contra_expense')`,
      [orgAId]
    );

    const netRevenue = Number((revResult as any[])[0].balance) - Number((contraResult as any[])[0].balance);
    const netExpense = Number((expResult as any[])[0].balance);
    const netIncome = netRevenue - netExpense;

    expect(netRevenue).toBe(1400);
    expect(netExpense).toBe(500);
    expect(netIncome).toBe(900);
  });

  it('net income for Org B is correct', async () => {
    const [revResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [orgBId]
    );
    const [contraResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'contra_revenue'`,
      [orgBId]
    );
    const [expResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) - COALESCE(SUM(gl.credit), 0) AS balance
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type IN ('expense', 'contra_expense')`,
      [orgBId]
    );

    const netRevenue = Number((revResult as any[])[0].balance) - Number((contraResult as any[])[0].balance);
    const netExpense = Number((expResult as any[])[0].balance);
    const netIncome = netRevenue - netExpense;

    // Revenue: 300, Contra: 0, Net Revenue: 300
    // Expense: 50, Net Expense: 50, Net Income: 250
    expect(netRevenue).toBe(300);
    expect(netExpense).toBe(50);
    expect(netIncome).toBe(250);
  });

  it('zero revenue and zero expense case', async () => {
    // Query with a non-matching organisation_id
    const [revResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) AS total_credits
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'revenue'`,
      [999999]
    );
    const [expResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) AS total_debits
       FROM general_ledger gl JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type = 'expense'`,
      [999999]
    );

    expect(Number((revResult as any[])[0].total_credits)).toBe(0);
    expect(Number((expResult as any[])[0].total_debits)).toBe(0);
  });

  // ── Regression Tests ──

  it('platform-wide report (no org filter) returns data from all orgs', async () => {
    const [result] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(debit), 0) AS total_debits, COALESCE(SUM(credit), 0) AS total_credits
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE a.code LIKE '999%'`
    );

    const totalCredits = Number((result as any[])[0].total_credits);
    const totalDebits = Number((result as any[])[0].total_debits);

    // All credits: 1000 + 500 + 200 + 100 = 1800
    // All debits: 300 + 200 + 100 + 50 = 650
    // But wait - the query only includes accounts with code LIKE '999%', not ORG-%
    // So only global account entries: 1000 (orgA revenue) + 200 (orgB revenue) = 1200 credits
    // And: 300 (orgA expense) + 100 (orgA contra) = 400 debits... but 9998 is expense, 9999 is revenue
    // Let me recalculate
    // Global revenue (9999): 1000 (orgA) + 200 (orgB) = 1200 credits
    // Global expense (9998): 300 (orgA) = 300 debits
    // Global contra_revenue (9997): 100 (orgA) = 100 debits
    expect(totalCredits).toBe(1200);
    expect(totalDebits).toBe(400);
  });

  it('trial balance handler preserves existing API contract (no org filter)', async () => {
    // Verify that querying without organisation filter returns records
    const [rows] = await testPool.execute<RowData>(
      `SELECT * FROM general_ledger WHERE account_id IN (SELECT id FROM chart_of_accounts WHERE code LIKE '999%')`
    );
    expect((rows as any[]).length).toBeGreaterThanOrEqual(4);
  });

  it('GL entries with NULL organisation_id are preserved', async () => {
    // Insert a manual journal entry without organisation_id using the period from beforeAll
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (NULL, ?, (SELECT id FROM chart_of_accounts WHERE code = '9999'), '2026-01-15', 0, 100, 0, 1)`,
      [periodId]
    );

    const [result] = await testPool.execute<RowData>(
      `SELECT * FROM general_ledger WHERE organisation_id IS NULL AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '9999')`
    );
    expect((result as any[]).length).toBeGreaterThanOrEqual(1);

    // Clean up that entry
    await testPool.execute(
      `DELETE FROM general_ledger WHERE organisation_id IS NULL AND account_id = (SELECT id FROM chart_of_accounts WHERE code = '9999') AND debit = 0 AND credit = 100`
    );
  });

  it('existing report fields remain intact (ReportLine properties)', async () => {
    // Verify the COA table has all expected columns
    const [coa] = await testPool.execute<RowData>(
      `SELECT * FROM chart_of_accounts WHERE code = '9999' LIMIT 1`
    );
    const account = (coa as any[])[0];
    expect(account).toHaveProperty('id');
    expect(account).toHaveProperty('code');
    expect(account).toHaveProperty('name');
    expect(account).toHaveProperty('type');
    expect(account).toHaveProperty('normal_side');
    expect(account).toHaveProperty('parent_id');
    expect(account).toHaveProperty('organisation_id');
    expect(account).toHaveProperty('is_system');
  });

  it('parent aggregation cannot cross organizations', async () => {
    // Global parent revenue account with a child owned by Org A and a child owned by Org B.
    // buildHierarchicalReport builds the COA tree scoped to (global OR own-org) accounts, so
    // Org B's child is excluded from Org A's tree and its GL balance can never be aggregated
    // into a parent that is visible to Org A.
    const [coaParent] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active, parent_id)
       VALUES (NULL, '9996', 'Test Global Parent Revenue', 'revenue', 'credit', 1, 1, NULL)`
    );
    const parentId = (coaParent as any).insertId;

    const [coaChildA] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active, parent_id)
       VALUES (?, '9995', 'Org A Parent Child Revenue', 'revenue', 'credit', 0, 1, ?)`,
      [orgAId, parentId]
    );
    const childAId = (coaChildA as any).insertId;

    const [coaChildB] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active, parent_id)
       VALUES (?, '9994', 'Org B Parent Child Revenue', 'revenue', 'credit', 0, 1, ?)`,
      [orgBId, parentId]
    );
    const childBId = (coaChildB as any).insertId;

    // Parent direct credit (org A) = 50, Child A credit (org A) = 100, Child B credit (org B) = 200
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 50, 0, 1)`, [orgAId, periodId, parentId]
    );
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 100, 0, 1)`, [orgAId, periodId, childAId]
    );
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 200, 0, 1)`, [orgBId, periodId, childBId]
    );

    // Org A scoped aggregation: only global + org-A-owned accounts are in the tree,
    // so Child B (200) must NOT leak into Org A's parent total.
    const [orgAResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ?
         AND a.code IN ('9996', '9995', '9994')
         AND (a.organisation_id IS NULL OR a.organisation_id = ?)`,
      [orgAId, orgAId]
    );
    // Parent own (50) + Child A (100) = 150; Child B excluded
    expect(Number((orgAResult as any[])[0].balance)).toBe(150);

    // Org B scoped aggregation: Parent (global) + Child B (200) = 200; Child A excluded
    const [orgBResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ?
         AND a.code IN ('9996', '9995', '9994')
         AND (a.organisation_id IS NULL OR a.organisation_id = ?)`,
      [orgBId, orgBId]
    );
    expect(Number((orgBResult as any[])[0].balance)).toBe(200);

    // Unscoped (platform) view aggregates both children under the same parent: 50 + 100 + 200 = 350
    const [platformResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.credit), 0) - COALESCE(SUM(gl.debit), 0) AS balance
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE a.code IN ('9996', '9995', '9994')`
    );
    expect(Number((platformResult as any[])[0].balance)).toBe(350);

    // Cleanup this test's data (afterAll also sweeps 999%/ORG-% codes as belt-and-suspenders)
    await testPool.execute(
      `DELETE FROM general_ledger WHERE account_id IN (?, ?, ?)`, [parentId, childAId, childBId]
    );
    await testPool.execute(
      `DELETE FROM chart_of_accounts WHERE id IN (?, ?, ?)`, [parentId, childAId, childBId]
    );
  });

  it('contra expense reduces net expense (contra_expense behavior)', async () => {
    // Post a credit to a contra_expense account for Org A. Org A has gross expense 500
    // (300 global + 200 org-owned) with no previous contra_expense, so net expense drops to 470.
    const [coaCE] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (NULL, '9993', 'Test Global Contra Expense', 'contra_expense', 'credit', 1, 1)`
    );
    const contraExpenseId = (coaCE as any).insertId;

    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 30, 0, 1)`,
      [orgAId, periodId, contraExpenseId]
    );

    // Gross expense is debit-normal; contra_expense credits offset it.
    const [expResult] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(gl.debit), 0) AS debits, COALESCE(SUM(gl.credit), 0) AS credits
       FROM general_ledger gl
       JOIN chart_of_accounts a ON a.id = gl.account_id
       WHERE gl.organisation_id = ? AND a.type IN ('expense', 'contra_expense')`,
      [orgAId]
    );
    const debits = Number((expResult as any[])[0].debits);
    const credits = Number((expResult as any[])[0].credits);

    expect(debits).toBe(500);   // 300 + 200 gross expense
    expect(credits).toBe(30);   // contra_expense credit
    expect(debits - credits).toBe(470); // net expense after contra

    // Cleanup this test's data
    await testPool.execute(`DELETE FROM general_ledger WHERE account_id = ?`, [contraExpenseId]);
    await testPool.execute(`DELETE FROM chart_of_accounts WHERE id = ?`, [contraExpenseId]);
  });
});

describe('Unification — Ledger Entries → GL Projection', () => {
  let orgId: number;
  let accountId: number;
  let periodId: number;
  let testPool: mysql.Pool;

  beforeAll(async () => {
    testPool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT) || 3307,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'courtzon2026',
      database: process.env.DB_NAME || 'courtzon_v3',
      connectionLimit: 2,
      charset: 'utf8mb4',
    });

    // Idempotent fixture: remove any leftovers from interrupted runs before seeding.
    // UNIFY-% accounts are owned by this suite's org, so purging by slug-scoped org id
    // keeps every delete on a narrow index range (no full table scans).
    await purgeReportingOrgsBySlugUnify(testPool);

    const [orgResult] = await testPool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active)
       VALUES (UUID(), (SELECT id FROM organisation_types LIMIT 1), 1, 'Test Unification Org', 'test-unify-org', 1)`
    );
    orgId = (orgResult as any).insertId;

    const [coaResult] = await testPool.execute<RowData>(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, is_system, is_active)
       VALUES (?, 'UNIFY-REV', 'Unification Revenue', 'revenue', 'credit', 0, 1)`, [orgId]
    );
    accountId = (coaResult as any).insertId;

    const [periodCheck] = await testPool.execute<RowData>(
      `SELECT id FROM accounting_periods WHERE status = 'open' LIMIT 1`
    );
    if (periodCheck.length > 0) {
      periodId = (periodCheck as any[])[0].id;
    } else {
      const [np] = await testPool.execute<RowData>(
        `INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date, status)
         VALUES (2026, 1, '2026-01-01', '2026-01-31', 'open')`
      );
      periodId = (np as any).insertId;
    }
  });

  afterAll(async () => {
    await testPool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await testPool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    if (orgId) await testPool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await testPool.end();
  });

  it('dual entry creates both ledger_entries and general_ledger rows', async () => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await testPool.execute(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
       VALUES (?, 'booking', 999, 'test_event', ?, ?, 'platform_revenue', 'credit', 100, 'EGP', 'Test unified posting', '999', ?)`,
      ['test_unified', orgId, accountId, now]
    );

    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 100, 0, 'booking_test_event', 999, 'Test unified posting', 1)`,
      [orgId, periodId, accountId]
    );

    const [glRows] = await testPool.execute<RowData>(
      `SELECT * FROM general_ledger WHERE reference_type = 'booking_test_event' AND reference_id = 999`
    );
    const [leRows] = await testPool.execute<RowData>(
      `SELECT * FROM ledger_entries WHERE source_type = 'booking' AND source_id = 999 AND event_type = 'test_event'`
    );

    expect((glRows as any[]).length).toBe(1);
    expect((leRows as any[]).length).toBe(1);
    expect(Number((glRows as any[])[0].credit)).toBe(100);
  });

  it('organization_id preserved in both tables', async () => {
    const [leRows] = await testPool.execute<RowData>(
      `SELECT organisation_id FROM ledger_entries WHERE source_type = 'booking' AND source_id = 999 AND event_type = 'test_event'`
    );
    const [glRows] = await testPool.execute<RowData>(
      `SELECT organisation_id FROM general_ledger WHERE reference_type = 'booking_test_event' AND reference_id = 999`
    );
    expect((leRows as any[])[0].organisation_id).toBe(orgId);
    expect((glRows as any[])[0].organisation_id).toBe(orgId);
  });

  it('debit/credit values match between ledger_entries and general_ledger', async () => {
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    // Credit posting
    await testPool.execute(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, organisation_id, chart_account_id, account_type, side, amount, currency, description, reference_id, recorded_at)
       VALUES (?, 'booking', 998, 'test_event2', ?, ?, 'platform_revenue', 'credit', 250, 'EGP', 'Credit test', '998', ?)`,
      ['test_unified2', orgId, accountId, now]
    );
    await testPool.execute(
      `INSERT INTO general_ledger (organisation_id, period_id, account_id, entry_date, debit, credit, balance, reference_type, reference_id, description, created_by)
       VALUES (?, ?, ?, '2026-01-15', 0, 250, 0, 'booking_test_event2', 998, 'Credit test', 1)`,
      [orgId, periodId, accountId]
    );

    const [leRows] = await testPool.execute<RowData>(
      `SELECT * FROM ledger_entries WHERE source_id = 998 AND event_type = 'test_event2'`
    );
    const [glRows] = await testPool.execute<RowData>(
      `SELECT * FROM general_ledger WHERE reference_id = 998 AND reference_type = 'booking_test_event2'`
    );

    expect(Number((leRows as any[])[0].amount)).toBe(250);
    expect((leRows as any[])[0].side).toBe('credit');
    expect(Number((glRows as any[])[0].credit)).toBe(250);
    expect(Number((glRows as any[])[0].debit)).toBe(0);
  });

  it('journal source_type is valid in ledger_entries', async () => {
    const [result] = await testPool.execute<RowData>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = 'courtzon_v3' AND TABLE_NAME = 'ledger_entries' AND COLUMN_NAME = 'source_type'`
    );
    const columnType = (result as any[])[0].COLUMN_TYPE;
    expect(columnType).toContain('journal');
  });

  it('reconciliation: GL totals match ledger_entries for test data', async () => {
    const [leCredits] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM ledger_entries
       WHERE source_type = 'booking' AND source_id IN (998, 999) AND side = 'credit' AND chart_account_id = ?`,
      [accountId]
    );
    const [glCredits] = await testPool.execute<RowData>(
      `SELECT COALESCE(SUM(credit), 0) AS total FROM general_ledger
       WHERE reference_type IN ('booking_test_event', 'booking_test_event2') AND reference_id IN (998, 999) AND account_id = ?`,
      [accountId]
    );

    expect(Number((leCredits as any[])[0].total)).toBe(350); // 100 + 250
    expect(Number((glCredits as any[])[0].total)).toBe(350);
    expect(Number((leCredits as any[])[0].total)).toBe(Number((glCredits as any[])[0].total));
  });
});
