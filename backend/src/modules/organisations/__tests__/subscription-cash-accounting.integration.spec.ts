import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

/**
 * REAL accounting posting path regression tests.
 *
 * Unlike subscription-cash-activation.spec.ts (which mocks postAccountingEvent),
 * these tests run the REAL canonical engine against a real MySQL:
 *   tryActivateSubscriptionRequest - postAccountingEvent - EVENT_CONCEPTS -
 *   accounting_event_mapping_lines - ledger_entries - general_ledger.
 *
 * They reproduce the UAT failure modes:
 *   - fresh Cash approval must persist exactly one balanced ledger entry;
 *   - re-approval must not duplicate it;
 *   - a legacy already-approved request missing its entry is back-filled once;
 *   - missing mapping rows fail the whole activation atomically (no active-without-ledger);
 *   - card approvals never post the cash event.
 *
 * Runs against the LOCAL Docker MySQL (port 3307) in a dedicated throwaway
 * database `courtzon_int_test` - never touches `courtzon_v3`.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// __tests__ - organisations - modules - src - backend - repo root
const projectRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const TEST_DB = 'courtzon_int_test';
const ADMIN = { host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026' };
// vitest buffers redirected stdout - log to a file for live progress visibility
const DIAG_LOG = 'C:/Users/mniaz/AppData/Local/Temp/opencode/diag-int.log';
function diag(msg: string): void {
  try {
    appendFileSync(DIAG_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {
    /* diagnostics must never fail the test */
  }
}


/**
 * Split a mysqldump file into executable statements, honouring DELIMITER
 * directives (trigger bodies) which mysql2 cannot process natively.
 */
function splitDump(sql: string): string[] {
  const out: string[] = [];
  let buf = '';
  let delim = ';';
  // Linear-time blank/comment check (regex alternative backtracks catastrophically
  // on the huge single-line INSERT statements in seed dumps)
  const isBlankOrComments = (s: string): boolean => {
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (ch === '\n' || ch === '\r' || ch === ' ' || ch === '\t') {
        i += 1;
        continue;
      }
      if ((ch === '-' && s[i + 1] === '-') || ch === '#') {
        while (i < s.length && s[i] !== '\n') i += 1;
        continue;
      }
      return false;
    }
    return true;
  };
  const flush = (): void => {
    const t = buf.trim();
    if (t && !isBlankOrComments(t)) out.push(t);
    buf = '';
  };
  for (const rawLine of sql.split(/\r?\n/)) {
    const dm = rawLine.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
    if (dm) {
      flush();
      delim = dm[1];
      continue;
    }
    buf += `${rawLine}\n`;
    const t = buf.trimEnd();
    if (t.endsWith(delim)) {
      buf = `${t.slice(0, t.length - delim.length).trim()}`;
      flush();
    }
  }
  flush();
  return out;
}

async function applySqlFile(conn: mysql.Connection, relativePath: string): Promise<void> {
  const raw = readFileSync(resolve(projectRoot, relativePath), 'utf8');
  const sql = raw.replace(/^\uFEFF/, '');
  const stmts = splitDump(sql);
  diag(`applying ${relativePath} (${stmts.length} statements)`);
  let i = 0;
  for (const stmt of stmts) {
    await conn.query(stmt);
    i += 1;
    if (i % 500 === 0) diag(`  ${relativePath}: ${i}/${stmts.length}`);
  }
  diag(`applied ${relativePath}`);
}

async function loadFullSchema(): Promise<void> {
  // Clone the EXACT production schema from the local Docker courtzon_v3
  // (structure only, no rows) — guarantees zero drift from the live schema —
  // then reapply ALL required seeds for reference data.
  const conn = await mysql.createConnection({
    ...ADMIN,
    multipleStatements: true,
  });
  try {
    await conn.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await conn.query(`CREATE DATABASE ${TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
    await conn.query(`USE ${TEST_DB}`);
    await conn.query('SET FOREIGN_KEY_CHECKS=0');

    const [tables] = await conn.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS t FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = 'courtzon_v3' AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME`,
    );
    diag(`cloning ${tables.length} tables from courtzon_v3`);
    for (const { t } of tables as any[]) {
      const [rows] = await conn.query<RowDataPacket[]>(`SHOW CREATE TABLE courtzon_v3.\`${t}\``);
      let ddl = (rows as any[])[0]['Create Table'] as string;
      ddl = ddl.replace(/\sAUTO_INCREMENT=\d+/i, '');
      // Rebind every table into the test schema
      ddl = ddl.replace(/CREATE TABLE `([^`]+)`/i, `CREATE TABLE \`${TEST_DB}\`.\`$1\``);
      await conn.query(ddl);
    }
    diag('schema cloned');
    await conn.query('SET FOREIGN_KEY_CHECKS=1');

    // Seed data inserts multiple GLOBAL rows whose *_scope helper columns
    // default to '' and violate production-era unique indexes — relax every
    // unique index built on a '*_scope' column inside the throwaway DB.
    const [scopeIdx] = await conn.query<RowDataPacket[]>(
      `SELECT DISTINCT s.TABLE_NAME AS t, s.INDEX_NAME AS i
       FROM information_schema.STATISTICS s
       JOIN information_schema.COLUMNS c
         ON c.TABLE_SCHEMA = s.TABLE_SCHEMA AND c.TABLE_NAME = s.TABLE_NAME AND c.COLUMN_NAME = s.COLUMN_NAME
       WHERE s.TABLE_SCHEMA = ? AND s.NON_UNIQUE = 0 AND s.INDEX_NAME <> 'PRIMARY'
         AND RIGHT(c.COLUMN_NAME, 6) = '_scope'`,
      [TEST_DB],
    );
    for (const { t, i } of scopeIdx as any[]) {
      try {
        await conn.query(`ALTER TABLE \`${TEST_DB}\`.\`${t}\` DROP INDEX \`${i}\``);
        diag(`dropped unique index ${i} on ${t}`);
      } catch {
        /* best effort */
      }
    }

    for (const seed of [
      'database/seeds/001_baseline.sql',
      'database/seeds/002_academy_programs.sql',
      'database/seeds/003_player_demo.sql',
      'database/seeds/004_chart_of_accounts.sql',
      'database/seeds/005_accounting_defaults.sql',
      'database/seeds/006_account_templates.sql',
    ]) {
      await applySqlFile(conn, seed);
    }
  } finally {
    await conn.end();
  }
}

/** Insert an open accounting period covering today (GL projection requires one). */
async function seedCurrentPeriod(): Promise<void> {
  const { getPool } = await import('../../../database/mysql.js');
  await getPool().execute(
    `INSERT INTO accounting_periods (fiscal_year, period_number, start_date, end_date, status)
     SELECT YEAR(CURDATE()), 1, MAKEDATE(YEAR(CURDATE()), 1), LAST_DAY(CONCAT(YEAR(CURDATE()), '-12-01')), 'open'`,
  );
}

/**
 * The seeded global chart has no guaranteed postable Level-4 leaf for the
 * subscription_cash_payment concepts (the production chart evolved through
 * migrations/admin edits). Build a dedicated asset→L4 and revenue→L4 chain and
 * repoint the global mapping rows at it — the engine only cares that both
 * accounts are active L4 leaves.
 */
async function seedPostableCoA(): Promise<{
  cashLeafId: number;
  revLeafId: number;
  cashLeafCode: string;
  revenueLeafCode: string;
}> {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();

  const insert = async (
    code: string,
    name: string,
    type: string,
    side: string,
    parentId: number | null,
  ): Promise<number> => {
    const [r]: any = await pool.execute(
      `INSERT INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_active)
       VALUES (NULL, ?, ?, ?, ?, ?, 1)`,
      [code, name, type, side, parentId],
    );
    return Number(r.insertId);
  };

  const l1 = await insert('TST-1000', 'Test Assets', 'asset', 'debit', null);
  const l2 = await insert('TST-1100', 'Test Cash & Banks', 'asset', 'debit', l1);
  const l3 = await insert('TST-1110', 'Test Bank Accounts', 'asset', 'debit', l2);
  const cashLeaf = await insert('TST-1120', 'Test Operating Bank', 'asset', 'debit', l3);

  const r1 = await insert('TST-4000', 'Test Revenue', 'revenue', 'credit', null);
  const r2 = await insert('TST-4100', 'Test Subscription Revenue', 'revenue', 'credit', r1);
  const r3 = await insert('TST-4110', 'Test Membership Fees', 'revenue', 'credit', r2);
  const revLeaf = await insert('TST-4120', 'Test Subscription Fees', 'revenue', 'credit', r3);

  // Repoint the global mapping at the postable leaves
  await pool.execute(
    "DELETE FROM accounting_event_mapping_lines WHERE event_type='subscription_cash_payment'",
  );
  await pool.execute(
    `INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
     VALUES ('subscription_cash_payment', NULL, 'cash_bank', ?, 1), ('subscription_cash_payment', NULL, 'revenue', ?, 1)`,
    [cashLeaf, revLeaf],
  );
  // Card subscription payments post through the generic 'card_payment' event
  // (payment_clearing + revenue). Give it the same postable test leaves — the
  // production chart evolved its own L4 leaves; the fresh clone lacks them.
  await pool.execute(
    "DELETE FROM accounting_event_mapping_lines WHERE event_type='card_payment'",
  );
  await pool.execute(
    `INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
     VALUES ('card_payment', NULL, 'payment_clearing', ?, 1), ('card_payment', NULL, 'revenue', ?, 1)`,
    [cashLeaf, revLeaf],
  );
  return {
    cashLeafId: cashLeaf,
    revLeafId: revLeaf,
    cashLeafCode: 'TST-1120',
    revenueLeafCode: 'TST-4120',
  };
}

let coa: Awaited<ReturnType<typeof seedPostableCoA>>;

interface FixtureIds {
  userId: number;
  orgId: number;
  planId: number;
  requestId: number;
}

let fixtureSeq = 0;

async function seedCashRegistrationFixture(
  suffix: string,
  opts: { withPrice?: boolean } = {},
): Promise<FixtureIds> {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  fixtureSeq += 1;
  const base = 915000 + fixtureSeq * 10;
  const userId = base;
  const orgId = userId;
  const planId = userId;
  const paymentMethod = suffix.startsWith('card') ? 'card' : 'cash';
  // Live registrations historically inserted requests WITHOUT requested_price
  const withPrice = opts.withPrice !== false;

  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, UUID(), 1, ?, ?, ?, 'x', ?, 'male')`,
    [userId, String(900000000 + base), `+249${String(900000000 + base)}`, `cash${suffix}@test.local`, `Cash Owner ${suffix}`],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_verified, is_active)
     VALUES (?, UUID(), 1, ?, ?, ?, FALSE, FALSE)`,
    [orgId, userId, `Cash Club ${suffix}`, `cash-club-${suffix}`],
  );
  await pool.execute(
    `INSERT INTO subscription_plans (id, plan_name, price_monthly, price_yearly, is_active, is_unlimited, is_internal)
     VALUES (?, 'Cash Test Plan', 777.00, 7770.00, TRUE, FALSE, FALSE)`,
    [planId],
  );
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', 'pending', TRUE)`,
    [orgId, planId],
  );
  const [res]: any = await pool.execute(
    `INSERT INTO organisation_upgrade_requests
       (organisation_id, registration_type, request_type, requested_by, requested_plan_id,
        requested_plan_name, requested_price, requested_billing_cycle, chosen_payment_method, status)
     VALUES (?, 'organization', 'NEW_SUBSCRIPTION', ?, ?, ?, ?, 'monthly', ?, 'pending')`,
    [
      orgId,
      userId,
      planId,
      withPrice ? 'Cash Test Plan' : null,
      withPrice ? 777.0 : null,
      paymentMethod,
    ],
  );
  return { userId, orgId, planId, requestId: Number(res.insertId) };
}

type RowData = RowDataPacket[];

beforeAll(async () => {
  diag('probing local docker mysql');
  // Fail fast with a clear message if the Docker MySQL is not reachable
  const probe = await mysql.createConnection({ ...ADMIN });
  await probe.query('SELECT 1');
  await probe.end();

  await loadFullSchema();
  diag('schema + seeds loaded');

  // Point the app DB module at the throwaway schema BEFORE any service import
  process.env.DB_HOST = ADMIN.host;
  process.env.DB_PORT = String(ADMIN.port);
  process.env.DB_USER = ADMIN.user;
  process.env.DB_PASSWORD = ADMIN.password;
  process.env.DB_NAME = TEST_DB;
  process.env.REDIS_HOST = '127.0.0.1';
  process.env.REDIS_PORT = '6379';

  vi.resetModules();
  const dbMod = await import('../../../database/mysql.js');
  dbMod.createPool({
    host: ADMIN.host,
    port: ADMIN.port,
    user: ADMIN.user,
    password: ADMIN.password,
    database: TEST_DB,
  });
  diag('pool created');
  // Admin actor referenced by approved_by FK in every approval path
  await dbMod.getPool().execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (910000, UUID(), 1, '900000999', '+249900000999', 'int-admin@test.local', 'x', 'Integration Admin', 'male')`,
  );
  await seedCurrentPeriod();
  coa = await seedPostableCoA();
  diag('period seeded - beforeAll done');
}, 180000);

afterAll(async () => {
  diag('afterAll: closing pool');
  try {
    const { closePool } = await import('../../../database/mysql.js');
    await closePool().catch(() => undefined);
  } catch {
    /* pool may already be gone */
  }
  diag('afterAll: dropping test database');
  try {
    const conn = await mysql.createConnection({ ...ADMIN, multipleStatements: true });
    await conn.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
    await conn.end();
  } catch {
    /* best effort */
  }
  diag('afterAll done');
}, 60000);

describe('Cash subscription approval - REAL accounting posting path (integration)', () => {
  it('posts exactly one balanced subscription_cash_payment entry through the canonical engine', async () => {
    diag('test: posts exactly one balanced subscription_cash_payment entry through the canonical engine');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`a${Date.now()}`);

    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');
    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });

    expect(result.activated).toBe(true);
    expect(result.organisationActivated).toBe(true);

    // - ledger_entries: exactly 2 rows, debit 1120 / credit 4100, exact amount -
    const [ledger] = await gp().execute<RowData>(
      `SELECT le.side, le.amount, le.currency, coa.code AS account_code
       FROM ledger_entries le
       JOIN chart_of_accounts coa ON coa.id = le.chart_account_id
       WHERE le.source_type = 'subscription' AND le.source_id = ? AND le.event_type = 'subscription_cash_payment'
       ORDER BY le.side`,
      [fx.requestId],
    );
    expect(ledger).toHaveLength(2);
    const debit = ledger.find((r: any) => r.side === 'debit');
    const credit = ledger.find((r: any) => r.side === 'credit');
    expect(debit.account_code).toBe(coa.cashLeafCode);
    expect(Number(debit.amount)).toBe(777);
    expect(credit.account_code).toBe(coa.revenueLeafCode);
    expect(Number(credit.amount)).toBe(777);
    expect(debit.currency).toBe('EGP');

    // - general_ledger projection exists for both legs -
    const [gl] = await gp().execute<RowData>(
      `SELECT gl.debit, gl.credit FROM general_ledger gl
       JOIN ledger_entries le ON le.id = gl.ledger_entry_id
       WHERE le.source_type = 'subscription' AND le.source_id = ? AND le.event_type = 'subscription_cash_payment'`,
      [fx.requestId],
    );
    expect(gl).toHaveLength(2);
    expect(gl.some((r: any) => Number(r.debit) === 777 && Number(r.credit) === 0)).toBe(true);
    expect(gl.some((r: any) => Number(r.credit) === 777 && Number(r.debit) === 0)).toBe(true);

    // - atomic state: subscription active + organisation verified+active -
    const [[req]] = await gp().execute<RowData>(
      'SELECT status FROM organisation_upgrade_requests WHERE id = ?', [fx.requestId],
    ) as any;
    expect(req.status).toBe('approved');
    const [[sub]] = await gp().execute<RowData>(
      "SELECT subscription_status FROM organisation_subscriptions WHERE organisation_id = ?", [fx.orgId],
    ) as any;
    expect(sub.subscription_status).toBe('active');
    const [[org]] = await gp().execute<RowData>(
      'SELECT is_verified, is_active FROM organisations WHERE id = ?', [fx.orgId],
    ) as any;
    expect(Number(org.is_verified)).toBe(1);
    expect(Number(org.is_active)).toBe(1);

    // - financial transaction audit row created with exact amount -
    const [txns] = await gp().execute<RowData>(
      "SELECT total_amount FROM transactions WHERE source_type = 'organisation_upgrade_request' AND source_id = ?",
      [fx.requestId],
    );
    expect(txns.length).toBeGreaterThanOrEqual(1);
    expect(Number(txns[0].total_amount)).toBe(777);
  });

  it('registration-style request WITHOUT persisted price still posts (amount resolved from plan)', async () => {
    diag('test: registration-style request without price still posts');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`np${Date.now()}`, { withPrice: false });

    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');
    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(result.activated).toBe(true);

    const [ledger] = await gp().execute<RowData>(
      `SELECT le.side, le.amount FROM ledger_entries le
       WHERE le.source_type='subscription' AND le.source_id=? AND le.event_type='subscription_cash_payment'`,
      [fx.requestId],
    );
    expect(ledger).toHaveLength(2);
    for (const row of ledger as any[]) expect(Number(row.amount)).toBe(777);
  });

  it('re-approval of the approved request does NOT duplicate the posting', async () => {
    diag('test: re-approval of the approved request does NOT duplicate the posting');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`b${Date.now()}`);
    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');

    await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });

    const countBefore = async () => {
      const [rows] = await gp().execute<RowData>(
        "SELECT COUNT(*) AS cnt FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='subscription_cash_payment'",
        [fx.requestId],
      );
      return Number((rows as any[])[0].cnt);
    };
    const before = await countBefore();
    expect(before).toBe(2); // debit + credit

    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(result.activated).toBe(false);
    expect(result.alreadyProcessed).toBe(true);

    expect(await countBefore()).toBe(2);
  });

  it('missing accounting mapping FAILS the approval atomically - subscription never becomes active', async () => {
    diag('test: missing accounting mapping FAILS the approval atomically - subscription never becomes active');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`c${Date.now()}`);
    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');

    // Simulate migration 142 / seed 005 missing on the environment
    await gp().execute(
      "DELETE FROM accounting_event_mapping_lines WHERE event_type = 'subscription_cash_payment'",
    );

    await expect(
      tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 }),
    ).rejects.toThrow(/No mapping found for event_type='subscription_cash_payment'/);

    // Nothing committed: request still pending, org still inactive/unverified, no ledger rows
    const [[req]] = await gp().execute<RowData>(
      'SELECT status FROM organisation_upgrade_requests WHERE id = ?', [fx.requestId],
    ) as any;
    expect(req.status).toBe('pending');
    const [[org]] = await gp().execute<RowData>(
      'SELECT is_verified, is_active FROM organisations WHERE id = ?', [fx.orgId],
    ) as any;
    expect(Number(org.is_verified)).toBe(0);
    expect(Number(org.is_active)).toBe(0);
    const [ledger] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=?", [fx.requestId],
    );
    expect(ledger).toHaveLength(0);

    // Restore mappings (pointing back at the postable leaves) so later tests are unaffected
    await gp().execute(
      `INSERT INTO accounting_event_mapping_lines (event_type, organisation_id, concept, account_id, is_active)
       VALUES ('subscription_cash_payment', NULL, 'cash_bank', ?, 1), ('subscription_cash_payment', NULL, 'revenue', ?, 1)`,
      [coa.cashLeafId, coa.revLeafId],
    );

    // After restoring the mapping, the SAME pending request approves successfully
    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(result.activated).toBe(true);
    const [ledgerAfter] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=?", [fx.requestId],
    );
    expect(ledgerAfter).toHaveLength(2);
  });

  it('legacy already-approved request WITHOUT a posting is back-filled exactly once', async () => {
    diag('test: legacy already-approved request WITHOUT a posting is back-filled exactly once');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`d${Date.now()}`);
    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');

    // Force the legacy inconsistent state: approved + active org, but NO ledger entry
    await gp().execute(
      "UPDATE organisation_upgrade_requests SET status='approved', approved_by=910000, approved_at=NOW() WHERE id=?",
      [fx.requestId],
    );
    await gp().execute(
      'UPDATE organisations SET is_verified=TRUE, is_active=TRUE WHERE id=?', [fx.orgId],
    );
    await gp().execute(
      "UPDATE organisation_subscriptions SET subscription_status='active' WHERE organisation_id=?", [fx.orgId],
    );

    // First re-approval call heals the accounting
    const healed = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(healed.alreadyProcessed).toBe(true);
    expect(healed.accountingBackfilled).toBe(true);
    const [afterHeal] = await gp().execute<RowData>(
      "SELECT side, amount FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='subscription_cash_payment'",
      [fx.requestId],
    );
    expect(afterHeal).toHaveLength(2);

    // Second call: pure idempotent skip - no second posting
    const again = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(again.alreadyProcessed).toBe(true);
    expect(again.accountingBackfilled).toBeUndefined();
    const [final] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=?",
      [fx.requestId],
    );
    expect(final).toHaveLength(2);
  });

  it('Credit Card approval does NOT create the cash posting', async () => {
    diag('test: Credit Card approval does NOT create the cash posting');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedCashRegistrationFixture(`card${Date.now()}`);
    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');

    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(result.activated).toBe(true);

    const [ledger] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='subscription_cash_payment'",
      [fx.requestId],
    );
    expect(ledger).toHaveLength(0);
  });
});

/**
 * ─── SELLER SUBSCRIPTION ACCOUNTING PARITY ─────────────────────────────────
 * Sellers must behave EXACTLY like organization subscriptions: same activation
 * service, same cash concept on admin approval, same generic card_payment
 * posting on payment:succeeded, same amount source, same idempotency.
 */
async function seedSellerFixture(
  suffix: string,
  opts: { method?: string; price?: number | null } = {},
): Promise<FixtureIds> {
  const { getPool } = await import('../../../database/mysql.js');
  const pool = getPool();
  fixtureSeq += 1;
  const base = 930000 + fixtureSeq * 10;
  const userId = base;
  const orgId = userId;
  const planId = userId;
  const method = opts.method ?? 'cash';
  const withPrice = opts.price !== null;

  await pool.execute(
    `INSERT INTO users (id, public_id, country_id, phone_number, full_phone, email, password_hash, full_name, gender)
     VALUES (?, UUID(), 1, ?, ?, ?, 'x', ?, 'male')`,
    [userId, String(800000000 + base), `+249${String(800000000 + base)}`, `seller${suffix}@test.local`, `Seller Owner ${suffix}`],
  );
  await pool.execute(
    `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_verified, is_active)
     VALUES (?, UUID(), 1, ?, ?, ?, FALSE, FALSE)`,
    [orgId, userId, `Seller Shop ${suffix}`, `seller-shop-${suffix}`],
  );
  await pool.execute(
    `INSERT INTO subscription_plans (id, plan_name, price_monthly, price_yearly, is_active, is_unlimited, is_internal)
     VALUES (?, 'Seller Test Plan', 777.00, 7770.00, TRUE, FALSE, FALSE)`,
    [planId],
  );
  await pool.execute(
    `INSERT INTO organisation_subscriptions (organisation_id, plan_id, billing_cycle, subscription_status, auto_renew)
     VALUES (?, ?, 'monthly', 'pending', TRUE)`,
    [orgId, planId],
  );
  // Mirrors auth.service.registerSeller's request INSERT (registration_type='seller')
  const [res]: any = await pool.execute(
    `INSERT INTO organisation_upgrade_requests
       (organisation_id, registration_type, requested_by, requested_plan_id,
        requested_plan_name, requested_price, requested_billing_cycle, chosen_payment_method, status)
     VALUES (?, 'seller', ?, ?, ?, ?, 'monthly', ?, 'pending')`,
    [orgId, userId, planId, withPrice ? 'Seller Test Plan' : null, withPrice ? (opts.price ?? 777.0) : null, method],
  );
  return { userId, orgId, planId, requestId: Number(res.insertId) };
}

async function seedPaidCardTxn(requestId: number, userId: number, amount: number): Promise<void> {
  const { getPool } = await import('../../../database/mysql.js');
  await getPool().execute(
    `INSERT INTO payment_transactions
       (user_id, reference_type, reference_id, payment_method, gateway_provider, gateway_reference, amount, currency, payment_status)
     VALUES (?, 'subscription', ?, 'card', 'paymob', ?, ?, 'EGP', 'paid')`,
    [userId, requestId, `e2e-${requestId}`, amount],
  );
}

describe('SELLER subscription accounting parity - REAL engine (integration)', () => {
  it('A+E+F: seller+cash approval → active org/subscription + exactly ONE balanced cash/revenue posting; idempotent on re-approval', async () => {
    diag('test: seller+cash parity');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedSellerFixture(`a${Date.now()}`, { method: 'cash', price: 777 });

    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');

    // D first: NOTHING posted while still pending
    const [pre] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=?", [fx.requestId],
    );
    expect(pre).toHaveLength(0);

    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    expect(result.activated).toBe(true);

    const [[sub]] = await gp().execute<RowData>(
      'SELECT subscription_status FROM organisation_subscriptions WHERE organisation_id=?', [fx.orgId],
    ) as any;
    expect(sub.subscription_status).toBe('active');
    const [[org]] = await gp().execute<RowData>(
      'SELECT is_verified, is_active FROM organisations WHERE id=?', [fx.orgId],
    ) as any;
    expect(Number(org.is_verified)).toBe(1);
    expect(Number(org.is_active)).toBe(1);

    // Exactly ONE balanced posting — debit cash leaf / credit revenue leaf @ exact price
    const [ledger] = await gp().execute<RowData>(
      `SELECT le.side, le.amount, coa.code AS account_code
       FROM ledger_entries le JOIN chart_of_accounts coa ON coa.id=le.chart_account_id
       WHERE le.source_type='subscription' AND le.source_id=? AND le.event_type='subscription_cash_payment'
       ORDER BY le.side`,
      [fx.requestId],
    );
    expect(ledger).toHaveLength(2);
    const debit = ledger.find((r: any) => r.side === 'debit');
    const credit = ledger.find((r: any) => r.side === 'credit');
    expect(debit.account_code).toBe(coa.cashLeafCode);
    expect(credit.account_code).toBe(coa.revenueLeafCode);
    expect(Number(debit.amount)).toBe(777);
    expect(Number(credit.amount)).toBe(777);

    // F: re-approval must not duplicate
    await tryActivateSubscriptionRequest(fx.requestId, { adminId: 910000 });
    const [afterRe] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='subscription_cash_payment'",
      [fx.requestId],
    );
    expect(afterRe).toHaveLength(2);
  });

  it('B+C+E: seller+card payment:succeeded → active subscription + card_payment revenue posting, NO cash entry', async () => {
    diag('test: seller+card parity');
    const { getPool: gp } = await import('../../../database/mysql.js');
    const fx = await seedSellerFixture(`c${Date.now()}`, { method: 'card', price: 777 });
    await seedPaidCardTxn(fx.requestId, fx.userId, 777);

    // Register the REAL production listeners, then emit the REAL domain event —
    // no test-local posting shortcuts.
    const { registerAccountingEventListeners } = await import('../../financial/application/accounting-event.listener.js');
    registerAccountingEventListeners();
    const { eventBusV2 } = await import('../../../shared/event-bus/index.js');
    await eventBusV2.emit('payment:succeeded', {
      paymentId: 900001,
      referenceType: 'subscription',
      referenceId: fx.requestId,
      amount: 777,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    });

    // Activation follows the same authoritative mechanism as the production
    // registration-payment.listener uses for registration requests.
    const { tryActivateSubscriptionRequest } = await import('../application/subscription-activation.service.js');
    const result = await tryActivateSubscriptionRequest(fx.requestId, { adminId: null, approvalNotes: 'Auto-approved after card payment' });
    expect(result.activated).toBe(true);
    const [[sub]] = await gp().execute<RowData>(
      'SELECT subscription_status FROM organisation_subscriptions WHERE organisation_id=?', [fx.orgId],
    ) as any;
    expect(sub.subscription_status).toBe('active');

    // C: NO cash entry for card flows
    const [cashRows] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='subscription_cash_payment'",
      [fx.requestId],
    );
    expect(cashRows).toHaveLength(0);

    // B/E: exactly one balanced card_payment posting @ exact paid amount
    const [card] = await gp().execute<RowData>(
      `SELECT le.side, le.amount, coa.code AS account_code
       FROM ledger_entries le JOIN chart_of_accounts coa ON coa.id=le.chart_account_id
       WHERE le.source_type='subscription' AND le.source_id=? AND le.event_type='card_payment'
       ORDER BY le.side`,
      [fx.requestId],
    );
    expect(card).toHaveLength(2);
    const debit = card.find((r: any) => r.side === 'debit');
    const credit = card.find((r: any) => r.side === 'credit');
    expect(debit.account_code).toBe(coa.cashLeafCode);
    expect(credit.account_code).toBe(coa.revenueLeafCode);
    expect(Number(debit.amount)).toBe(777);
    expect(Number(credit.amount)).toBe(777);

    // F: duplicate payment:succeeded events must not duplicate entries
    await eventBusV2.emit('payment:succeeded', {
      paymentId: 900001,
      referenceType: 'subscription',
      referenceId: fx.requestId,
      amount: 777,
      metadata: { paymentMethod: 'card', currency: 'EGP' },
    });
    const [afterDup] = await gp().execute<RowData>(
      "SELECT 1 FROM ledger_entries WHERE source_type='subscription' AND source_id=? AND event_type='card_payment'",
      [fx.requestId],
    );
    expect(afterDup).toHaveLength(2);
  });
});
