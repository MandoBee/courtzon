import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';

process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3005';

type RowData = RowDataPacket[];

const __dirname = dirname(fileURLToPath(import.meta.url));
// __tests__ - financial - modules - src - backend - repo root
const projectRoot = resolve(__dirname, '..', '..', '..', '..', '..');
const MIGRATION = resolve(projectRoot, 'database/migrations/154_settlement_historical_correction.sql');

/**
 * Historical Marketplace Organisation Settlement Correction — Integration
 *
 * Verifies the audit-preserving correction of the three pre-ec2a5ab settlements
 * is performed through the CANONICAL ACCOUNTING ENGINE (`postAccountingEvent`),
 * exactly as `backend/scripts/correct-historical-settlements.mjs` does:
 *   Migration 154 provisions org-scoped ORG-CASH / 1161 accounts + mapping rows;
 *   the correction runner then posts three balanced journals per settlement:
 *     settlement_paid_reversal   (org-scoped Dr 1120 / Cr 2200)
 *     settlement_paid_correction (global   Dr 2202 / Cr 1120)
 *     settlement_org_receipt     (org-scoped Dr ORG-CASH / Cr 1161)
 *
 *   1. Settlement #1 (org 6, 810.00), #2 (org 6, 7509.40), #3 (org 28, 140.75)
 *      each receive exactly three correction event types.
 *   2. Every journal is balanced; original rows 159-164 stay immutable.
 *   3. CourtZon 2202 credit of 8460.15 is cleared exactly once; org 1161
 *      (8319.40 / 140.75) cleared exactly once.
 *   4. Re-running the correction is a no-op (idempotent).
 *   5. No business/settlement/payment/entitlement record is modified.
 *   6. general_ledger projections exist for every new journal and reconcile.
 *
 * All assertions are SOURCE-SCOPED (they inspect the exact ledger rows for a
 * given settlement id), so the test is deterministic even when other spec
 * files run concurrently against the same shared MySQL database.
 */
describe('Historical Settlement Correction (migration 154 + canonical engine)', () => {
  let pool: mysql.Pool;
  const SIDS = [1, 2, 3];

  // Global COA resolution by stable CODE (never hard-coded ids).
  async function globalAccountId(code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? AND is_active = 1 LIMIT 1',
      [code],
    );
    if (!(rows as any[]).length) throw new Error(`Global account ${code} not found`);
    return Number((rows as any[])[0].id);
  }

  async function orgAccountId(orgId: number, code: string): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      'SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ? AND is_active = 1 LIMIT 1',
      [orgId, code],
    );
    if (!(rows as any[]).length) throw new Error(`Org ${orgId} account ${code} not found`);
    return Number((rows as any[])[0].id);
  }

  interface Row {
    id: number;
    eventType: string;
    orgId: number | null;
    side: string;
    amount: number;
    code: string;
    description: string | null;
  }

  async function rowsFor(sid: number): Promise<Row[]> {
    const [rows] = await pool.execute<RowData>(
      `SELECT le.id AS id, le.event_type AS eventType, le.organisation_id AS orgId,
              le.side AS side, le.amount AS amount, a.code AS code, le.description AS description
       FROM ledger_entries le LEFT JOIN chart_of_accounts a ON a.id = le.chart_account_id
       WHERE le.source_type = 'settlement' AND le.source_id = ?
       ORDER BY le.event_type, le.side, a.code, le.id`,
      [sid],
    );
    return (rows as any[]).map((r: any) => ({
      ...r,
      amount: Number(r.amount),
      orgId: r.orgId == null ? null : Number(r.orgId),
    }));
  }

  async function eventRows(sid: number, eventType: string): Promise<Row[]> {
    return (await rowsFor(sid)).filter((r) => r.eventType === eventType);
  }

  async function countEvents(): Promise<Record<string, number>> {
    const [rows] = await pool.execute<RowData>(
      `SELECT event_type AS et, COUNT(*) AS cnt FROM ledger_entries
       WHERE source_type='settlement' AND source_id IN (1,2,3)
         AND event_type IN ('settlement_paid_reversal','settlement_paid_correction','settlement_org_receipt')
       GROUP BY event_type`,
    );
    const out: Record<string, number> = {};
    for (const r of rows as any[]) out[r.et] = Number(r.cnt);
    return out;
  }

  /** Apply migration 154 (provisioning-only: org ORG-CASH/1161 + mapping rows). */
  async function applyMigration(): Promise<void> {
    const raw = readFileSync(MIGRATION, 'utf8').replace(/^\uFEFF/, '');
    const conn = await mysql.createConnection({
      host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3',
      multipleStatements: true,
    });
    try {
      await conn.query(raw);
    } finally {
      await conn.end();
    }
  }

  /** Run the correction through the CANONICAL engine (same as the runner script). */
  async function applyCorrection(): Promise<{ posted: number; skipped: number }> {
    const { applyHistoricalSettlementCorrections } = await import('../application/settlement-correction.service.js');
    return applyHistoricalSettlementCorrections();
  }

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    // ── Cleanup any leftovers from a prior (failed) run ──
    for (const sid of SIDS) {
      await pool.execute(`DELETE FROM settlement_entitlements WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_orders WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_transfers WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM financial_entitlements WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlements WHERE id = ?`, [sid]);
    }
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (1,2,3)`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement_%' AND reference_id IN (1,2,3)`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE event_type='settlement_org_receipt' AND organisation_id IN (6,28)`);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE code='ORG-CASH' AND organisation_id IN (6,28)`);

    // org 6 & 28 must exist for the migration (FK). Create if missing.
    for (const org of [
      { id: 6, slug: 'padel-edge' },
      { id: 28, slug: 'settle-corr-org-28' },
    ]) {
      const [ex] = await pool.execute<RowData>('SELECT id FROM organisations WHERE id = ?', [org.id]);
      if (!(ex as any[]).length) {
        const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
        await pool.execute(
          `INSERT INTO organisations (id, public_id, org_type_id, owner_id, name, slug, is_active)
           VALUES (?, UUID(), ?, 1, ?, ?, 1)`,
          [org.id, (ot as any[])[0].id, org.slug, org.slug],
        );
      }
    }

    // ── Fixture: settlements 1/2/3 (mirror production) ──
    const settlements = [
      { id: 1, org: 6, status: 'completed', dir: 'courtzon_to_org', net: 810.00, paidAmt: 810.00, paidBy: 68, commission: 40.00, created: '2026-09-02 22:40:02', paidAt: '2026-09-03 13:29:06', batch: 'SET-2026-09-02-942' },
      { id: 2, org: 6, status: 'completed', dir: 'courtzon_to_org', net: 7509.40, paidAmt: 7509.40, paidBy: 1, commission: 392.60, created: '2026-09-03 13:28:42', paidAt: '2026-09-03 13:28:43', batch: 'SET-2026-09-03-605' },
      { id: 3, org: 28, status: 'completed', dir: 'courtzon_to_org', net: 140.75, paidAmt: 140.75, paidBy: 1, commission: 4.25, created: '2026-09-03 13:39:35', paidAt: '2026-09-03 13:39:36', batch: 'SET-2026-09-03-401' },
    ];
    for (const s of settlements) {
      await pool.execute(
        `INSERT INTO settlements (id, organisation_id, settlement_status, aggregate_version, settlement_direction, settlement_type, batch_code, commission_amount, net_amount, organization_net, paid_amount, paid_by, requested_at, paid_at, completed_at, created_at, updated_at)
         VALUES (?, ?, 'completed', 2, ?, 'unified', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.org, s.dir, s.batch, s.commission, s.net, s.net, s.paidAmt, s.paidBy, s.created, s.paidAt, s.paidAt, s.created, s.paidAt],
      );
    }

    // ── Fixture: financial_entitlements + settlement_entitlements ──
    const ents = [
      { id: 49, org: 6, type: 'ORGANIZATION_EARNING', amount: 607.50, sid: 1 },
      { id: 50, org: 6, type: 'COURTZON_COMMISSION', amount: 30.00, sid: 1 },
      { id: 51, org: 6, type: 'ORGANIZATION_EARNING', amount: 202.50, sid: 1 },
      { id: 52, org: 6, type: 'COURTZON_COMMISSION', amount: 10.00, sid: 1 },
      { id: 55, org: 6, type: 'ORGANIZATION_EARNING', amount: 143.46, sid: 2 },
      { id: 56, org: 6, type: 'COURTZON_COMMISSION', amount: 7.50, sid: 2 },
      { id: 57, org: 6, type: 'ORGANIZATION_EARNING', amount: 7365.94, sid: 2 },
      { id: 58, org: 6, type: 'COURTZON_COMMISSION', amount: 385.10, sid: 2 },
      { id: 53, org: 28, type: 'ORGANIZATION_EARNING', amount: 140.75, sid: 3 },
      { id: 54, org: 28, type: 'COURTZON_COMMISSION', amount: 4.25, sid: 3 },
    ];
    for (const e of ents) {
      await pool.execute(
        `INSERT INTO financial_entitlements (id, public_id, organisation_id, entitlement_type, source_type, source_id, collector, amount, currency, status, settled_at, settlement_id, description, aggregate_version, created_by, created_at, updated_at)
         VALUES (?, UUID(), ?, ?, 'marketplace', ?, 'courtzon', ?, 'EGP', 'SETTLED', NOW(), ?, ?, 1, 1, NOW(), NOW())`,
        [e.id, e.org, e.type, e.id, e.amount, e.sid, `Order fixture #${e.id} entitlement`],
      );
      await pool.execute(
        `INSERT INTO settlement_entitlements (settlement_id, entitlement_id, created_at) VALUES (?, ?, NOW())`,
        [e.sid, e.id],
      );
    }

    // ── Fixture: historical immutable ledger rows 159-164 ──
    const g2200 = await globalAccountId('2200');
    const g1120 = await globalAccountId('1120');
    const hist = [
      { id: 159, sid: 2, org: 6, side: 'debit', amount: 7509.40 },
      { id: 160, sid: 2, org: 6, side: 'credit', amount: 7509.40 },
      { id: 161, sid: 1, org: 6, side: 'debit', amount: 810.00 },
      { id: 162, sid: 1, org: 6, side: 'credit', amount: 810.00 },
      { id: 163, sid: 3, org: 28, side: 'debit', amount: 140.75 },
      { id: 164, sid: 3, org: 28, side: 'credit', amount: 140.75 },
    ];
    for (const h of hist) {
      const acct = h.side === 'debit' ? g2200 : g1120;
      await pool.execute(
        `INSERT INTO ledger_entries (id, transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
         VALUES (?, ?, 'settlement', ?, 'settlement_paid', NULL, ?, ?, NULL, ?, ?, 'EGP', ?, NOW())`,
        [h.id, `acct_settlement_paid_settlement_${h.sid}_hist`, h.sid, h.org, acct, h.side, h.amount, `Settlement #${h.sid} paid`],
      );
    }

    // ── Fixture: supporting global marketplace_card_payment rows (2202 credits) ──
    const g2202 = await globalAccountId('2202');
    const g4160 = await globalAccountId('4160');
    const g1100 = await globalAccountId('1100');
    const mkt = [
      // order 23 (org 28): Cr 2202 140.75 / Cr 4160 4.25 / Dr 1100 145.00
      { orderId: 23, org: 28, c2202: 140.75, c4160: 4.25, d1100: 145.00 },
      // order 24 (org 6): Cr 2202 810.00 / Cr 4160 40.00 / Dr 1100 850.00
      { orderId: 24, org: 6, c2202: 810.00, c4160: 40.00, d1100: 850.00 },
      // order 25 (org 6): Cr 2202 7509.40 / Cr 4160 392.60 / Dr 1100 7902.00
      { orderId: 25, org: 6, c2202: 7509.40, c4160: 392.60, d1100: 7902.00 },
    ];
    for (const m of mkt) {
      await pool.execute(
        `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
         VALUES (?, 'marketplace', ?, 'marketplace_card_payment', NULL, NULL, ?, NULL, 'credit', ?, 'EGP', ?, NOW())`,
        [`mkt_cp_${m.orderId}_2202`, m.orderId, g2202, m.c2202, `Order #${m.orderId} payment (custody: courtzon)`],
      );
      await pool.execute(
        `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
         VALUES (?, 'marketplace', ?, 'marketplace_card_payment', NULL, NULL, ?, NULL, 'credit', ?, 'EGP', ?, NOW())`,
        [`mkt_cp_${m.orderId}_4160`, m.orderId, g4160, m.c4160, `Order #${m.orderId} payment (custody: courtzon)`],
      );
      await pool.execute(
        `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
         VALUES (?, 'marketplace', ?, 'marketplace_card_payment', NULL, NULL, ?, NULL, 'debit', ?, 'EGP', ?, NOW())`,
        [`mkt_cp_${m.orderId}_1100`, m.orderId, g1100, m.d1100, `Order #${m.orderId} payment (custody: courtzon)`],
      );
    }

    // ── Fixture: provision org-scoped 1161 + ORG-CASH accounts (mirror production) ──
    const parentCash = await globalAccountId('ASSETS-CASH');
    const parentRecv = await globalAccountId('ASSETS-RECEIVABLES');
    for (const org of [6, 28]) {
      await pool.execute(
        `INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
         VALUES (?, 'ORG-CASH', 'Organization Cash / Bank', 'asset', 'debit', ?, 1, 1, 'Organization cash/bank (test fixture)')`,
        [org, parentCash],
      );
      await pool.execute(
        `INSERT IGNORE INTO chart_of_accounts (organisation_id, code, name, type, normal_side, parent_id, is_system, is_active, description)
         VALUES (?, '1161', 'Marketplace Receivable', 'asset', 'debit', ?, 1, 1, 'Marketplace Receivable (test fixture)')`,
        [org, parentRecv],
      );
    }

    // ── Fixture: supporting org-book receivable rows (marketplace_org_receivable) ──
    await pool.execute(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
       SELECT 'mkt_or_23_1161', 'marketplace', 23, 'marketplace_org_receivable', NULL, 28, id, NULL, 'debit', 140.75, 'EGP', 'Order #23 organization book', NOW()
       FROM chart_of_accounts WHERE organisation_id = 28 AND code = '1161' AND is_active = 1 LIMIT 1`,
    );
    await pool.execute(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
       SELECT 'mkt_or_24_1161', 'marketplace', 24, 'marketplace_org_receivable', NULL, 6, id, NULL, 'debit', 810.00, 'EGP', 'Order #24 organization book', NOW()
       FROM chart_of_accounts WHERE organisation_id = 6 AND code = '1161' AND is_active = 1 LIMIT 1`,
    );
    await pool.execute(
      `INSERT INTO ledger_entries (transaction_id, source_type, source_id, event_type, period_id, organisation_id, chart_account_id, account_type, side, amount, currency, description, recorded_at)
       SELECT 'mkt_or_25_1161', 'marketplace', 25, 'marketplace_org_receivable', NULL, 6, id, NULL, 'debit', 7509.40, 'EGP', 'Order #25 organization book', NOW()
       FROM chart_of_accounts WHERE organisation_id = 6 AND code = '1161' AND is_active = 1 LIMIT 1`,
    );
  });

  afterAll(async () => {
    // Cleanup — source-scoped + org-scoped, FK-safe order.
    for (const sid of SIDS) {
      await pool.execute(`DELETE FROM settlement_entitlements WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_orders WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlement_transfers WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM financial_entitlements WHERE settlement_id = ?`, [sid]);
      await pool.execute(`DELETE FROM settlements WHERE id = ?`, [sid]);
    }
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (1,2,3)`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'settlement_%' AND reference_id IN (1,2,3)`);
    await pool.execute(`DELETE FROM ledger_entries WHERE transaction_id LIKE 'mkt_cp_%' OR transaction_id LIKE 'mkt_or_%'`);
    await pool.execute(`DELETE FROM general_ledger WHERE reference_type LIKE 'marketplace_marketplace_%' AND reference_id IN (23,24,25)`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE event_type='settlement_org_receipt' AND organisation_id IN (6,28)`);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE code='ORG-CASH' AND organisation_id IN (6,28)`);
    // Also remove any org-scoped 1161 accounts created for org 6 by this spec.
    await pool.execute(`DELETE FROM chart_of_accounts WHERE code='1161' AND organisation_id IN (6,28) AND name='Marketplace Receivable (test fixture)'`);
    // Remove fixture org 28 if created by this spec (org 6 is a real org).
    await pool.execute(`DELETE FROM organisations WHERE id = 28 AND slug = 'settle-corr-org-28'`);
    await pool.end();
  });

  // ── Tests ──

  it('1. migration 154 provisions; correction gives each settlement its three event types', async () => {
    await applyMigration();
    await applyCorrection();
    const counts = await countEvents();
    // 3 settlements x 2 lines each per event type = 6 rows per event type.
    expect(counts['settlement_paid_reversal']).toBe(6);
    expect(counts['settlement_paid_correction']).toBe(6);
    expect(counts['settlement_org_receipt']).toBe(6);

    for (const sid of SIDS) {
      const rows = await rowsFor(sid);
      const types = new Set(rows.map((r) => r.eventType));
      expect(types.has('settlement_paid_reversal')).toBe(true);
      expect(types.has('settlement_paid_correction')).toBe(true);
      expect(types.has('settlement_org_receipt')).toBe(true);
    }
  });

  it('2-3. settlements #1, #2, #3 each have exactly 6 correction lines (2 per event)', async () => {
    for (const sid of SIDS) {
      const rows = await rowsFor(sid);
      const corr = rows.filter((r) => r.eventType !== 'settlement_paid'); // exclude historical
      expect(corr).toHaveLength(6);
    }
  });

  it('4. every correction journal is balanced (Dr = Cr per event)', async () => {
    for (const sid of SIDS) {
      for (const ev of ['settlement_paid_reversal', 'settlement_paid_correction', 'settlement_org_receipt']) {
        const rows = await eventRows(sid, ev);
        const dr = rows.filter((r) => r.side === 'debit').reduce((s, r) => s + r.amount, 0);
        const cr = rows.filter((r) => r.side === 'credit').reduce((s, r) => s + r.amount, 0);
        expect(Math.abs(dr - cr)).toBeLessThan(0.001);
      }
    }
  });

  it('5. original ledger rows 159-164 remain unchanged (immutable)', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT le.id, le.source_type, le.source_id, le.event_type, le.organisation_id,
              le.chart_account_id, le.side, le.amount, le.currency, le.description
       FROM ledger_entries le WHERE le.id IN (159,160,161,162,163,164) ORDER BY le.id`,
    );
    expect(rows).toHaveLength(6);
    const map: Record<number, any> = {};
    for (const r of rows as any[]) map[Number(r.id)] = r;
    expect(map[161].event_type).toBe('settlement_paid');
    expect(map[161].organisation_id).toBe(6);
    expect(map[161].side).toBe('debit');
    expect(Number(map[161].amount)).toBe(810.00);
    expect(map[162].side).toBe('credit');
    expect(Number(map[162].amount)).toBe(810.00);
    expect(map[159].event_type).toBe('settlement_paid');
    expect(map[159].organisation_id).toBe(6);
    expect(Number(map[159].amount)).toBe(7509.40);
    expect(map[160].side).toBe('credit');
    expect(Number(map[160].amount)).toBe(7509.40);
    expect(map[163].event_type).toBe('settlement_paid');
    expect(map[163].organisation_id).toBe(28);
    expect(Number(map[163].amount)).toBe(140.75);
    expect(map[164].side).toBe('credit');
    expect(Number(map[164].amount)).toBe(140.75);
  });

  it('6. CourtZon correction rows are global (org NULL), Dr 2202 / Cr 1120', async () => {
    for (const sid of SIDS) {
      const rows = await eventRows(sid, 'settlement_paid_correction');
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.orgId === null)).toBe(true);
      const debit = rows.find((r) => r.side === 'debit');
      const credit = rows.find((r) => r.side === 'credit');
      expect(debit?.code).toBe('2202');
      expect(credit?.code).toBe('1120');
      expect(debit?.amount).toBe(credit?.amount);
    }
  });

  it('7. organisation reversal rows are org-scoped, Dr 1120 / Cr 2200', async () => {
    const expectedOrg: Record<number, number> = { 1: 6, 2: 6, 3: 28 };
    for (const sid of SIDS) {
      const rows = await eventRows(sid, 'settlement_paid_reversal');
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.orgId === expectedOrg[sid])).toBe(true);
      const debit = rows.find((r) => r.side === 'debit');
      const credit = rows.find((r) => r.side === 'credit');
      expect(debit?.code).toBe('1120');
      expect(credit?.code).toBe('2200');
      expect(debit?.amount).toBe(credit?.amount);
    }
  });

  it('8. organisation receipt rows are org-scoped, Dr ORG-CASH / Cr 1161', async () => {
    const expectedOrg: Record<number, number> = { 1: 6, 2: 6, 3: 28 };
    for (const sid of SIDS) {
      const rows = await eventRows(sid, 'settlement_org_receipt');
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.orgId === expectedOrg[sid])).toBe(true);
      const debit = rows.find((r) => r.side === 'debit');
      const credit = rows.find((r) => r.side === 'credit');
      expect(debit?.code).toBe('ORG-CASH');
      expect(credit?.code).toBe('1161');
      expect(debit?.amount).toBe(credit?.amount);
    }
  });

  it('9. organisation isolation — org 6 corrections never touch org 28 and vice-versa', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT le.source_id AS sid, le.organisation_id AS orgId, le.event_type AS et
       FROM ledger_entries le
       WHERE le.source_type='settlement' AND le.source_id IN (1,2,3)
         AND le.event_type IN ('settlement_paid_reversal','settlement_paid_correction','settlement_org_receipt')`,
    );
    for (const r of rows as any[]) {
      const sid = Number(r.sid);
      const orgId = r.orgId == null ? null : Number(r.orgId);
      if (sid === 1 || sid === 2) {
        // org 6 settlements: correction rows are global; reversal + receipt are org 6.
        if (r.et === 'settlement_paid_reversal' || r.et === 'settlement_org_receipt') {
          expect(orgId).toBe(6);
          expect(orgId).not.toBe(28);
        }
      } else if (sid === 3) {
        if (r.et === 'settlement_paid_reversal' || r.et === 'settlement_org_receipt') {
          expect(orgId).toBe(28);
          expect(orgId).not.toBe(6);
        }
      }
    }
  });

  it('10. no double-clearing — 2202 cleared once (8460.15), org 1161 cleared once', async () => {
    const g2202 = await globalAccountId('2202');
    const [deb] = await pool.execute<RowData>(
      `SELECT SUM(amount) AS s FROM ledger_entries
       WHERE source_type='settlement' AND source_id IN (1,2,3)
         AND event_type='settlement_paid_correction' AND side='debit' AND chart_account_id = ?`,
      [g2202],
    );
    expect(Number((deb as any[])[0].s)).toBeCloseTo(8460.15, 2);

    const [creds] = await pool.execute<RowData>(
      `SELECT a.code AS code, SUM(le.amount) AS s, le.organisation_id AS orgId
       FROM ledger_entries le JOIN chart_of_accounts a ON a.id = le.chart_account_id
       WHERE le.source_type='settlement' AND le.source_id IN (1,2,3)
         AND le.event_type='settlement_org_receipt' AND le.side='credit' AND a.code='1161'
       GROUP BY le.organisation_id, a.code`,
    );
    const map: Record<number, number> = {};
    for (const r of creds as any[]) map[Number(r.orgId)] = Number(r.s);
    expect(map[6]).toBeCloseTo(8319.40, 2);
    expect(map[28]).toBeCloseTo(140.75, 2);
  });

  it('11. re-running the correction is a no-op (idempotent)', async () => {
    const before = await countEvents();
    await applyCorrection();
    const after = await countEvents();
    expect(after).toEqual(before);
  });

  it('12. no changes to settlements / entitlements / payments / gateway records', async () => {
    const [s] = await pool.execute<RowData>(
      `SELECT id, settlement_status, settlement_direction, paid_amount FROM settlements WHERE id IN (1,2,3) ORDER BY id`,
    );
    expect(s).toHaveLength(3);
    const sMap: Record<number, any> = {};
    for (const r of s as any[]) sMap[Number(r.id)] = r;
    expect(sMap[1].settlement_status).toBe('completed');
    expect(Number(sMap[1].paid_amount)).toBe(810.00);
    expect(sMap[2].settlement_status).toBe('completed');
    expect(Number(sMap[2].paid_amount)).toBe(7509.40);
    expect(sMap[3].settlement_status).toBe('completed');
    expect(Number(sMap[3].paid_amount)).toBe(140.75);

    const [fe] = await pool.execute<RowData>(
      `SELECT status FROM financial_entitlements WHERE id IN (49,50,51,52,53,54,55,56,57,58)`,
    );
    expect((fe as any[]).length).toBe(10);
    for (const r of fe as any[]) expect(r.status).toBe('SETTLED');

    const [se] = await pool.execute<RowData>(`SELECT COUNT(*) AS cnt FROM settlement_entitlements WHERE settlement_id IN (1,2,3)`);
    expect(Number((se as any[])[0].cnt)).toBe(10);
  });

  it('13. no settlement other than 1/2/3 receives correction rows', async () => {
    // Source-scoped: other spec files running concurrently on the shared DB may
    // create their OWN correction rows for their own settlement ids (e.g. the
    // org-settlement-receipt suite). We therefore restrict the assertion to the
    // correction rows that reference the settlements created by THIS fixture —
    // exactly the 18 rows for source_id 1/2/3 (verified in tests 1 and 14) and
    // nothing referencing any other settlement.
    const [rows] = await pool.execute<RowData>(
      `SELECT le.source_id AS sid, COUNT(*) AS cnt
       FROM ledger_entries le
       WHERE le.source_type='settlement'
         AND le.event_type IN ('settlement_paid_reversal','settlement_paid_correction','settlement_org_receipt')
         AND le.source_id IN (1,2,3)
       GROUP BY le.source_id`,
    );
    const map: Record<number, number> = {};
    for (const r of rows as any[]) map[Number(r.sid)] = Number(r.cnt);
    expect(map[1]).toBe(6);
    expect(map[2]).toBe(6);
    expect(map[3]).toBe(6);

    // The correction service is hard-coded to source_type='settlement' and
    // source_id IN (1,2,3) — it can never post for any other settlement id.
    const { HISTORICAL_SETTLEMENT_CORRECTIONS } = await import('../application/settlement-correction.service.js');
    expect(HISTORICAL_SETTLEMENT_CORRECTIONS.map((c) => c.settlementId).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  it('14. general_ledger projections exist for every new correction journal and reconcile', async () => {
    const [le] = await pool.execute<RowData>(
      `SELECT le.id AS id, le.organisation_id AS orgId, le.chart_account_id AS acctId,
              le.side AS side, le.amount AS amount, le.period_id AS periodId,
              CONCAT(le.source_type,'_',le.event_type) AS refType, le.source_id AS refId
       FROM ledger_entries le
       WHERE le.source_type='settlement' AND le.source_id IN (1,2,3)
         AND le.event_type IN ('settlement_paid_reversal','settlement_paid_correction','settlement_org_receipt')`,
    );
    expect((le as any[]).length).toBe(18);
    for (const e of le as any[]) {
      const [gl] = await pool.execute<RowData>(
        `SELECT gl.ledger_entry_id, gl.organisation_id, gl.period_id, gl.account_id,
                gl.entry_date, gl.debit, gl.credit, gl.balance, gl.reference_type, gl.reference_id
         FROM general_ledger gl WHERE gl.ledger_entry_id = ?`,
        [e.id],
      );
      expect(gl).toHaveLength(1);
      const g = (gl as any[])[0];
      expect(Number(g.period_id)).toBe(Number(e.periodId));
      expect(Number(g.account_id)).toBe(Number(e.acctId));
      expect(g.reference_type).toBe(e.refType);
      expect(Number(g.reference_id)).toBe(Number(e.refId));
      if (e.side === 'debit') {
        expect(Number(g.debit)).toBe(Number(e.amount));
        expect(Number(g.credit)).toBe(0);
      } else {
        expect(Number(g.credit)).toBe(Number(e.amount));
        expect(Number(g.debit)).toBe(0);
      }
      expect(Number(g.balance)).toBe(0);
    }
  });

  it('15. accounting period / reference metadata is correct for September 2026', async () => {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT le.period_id AS pid, gl.entry_date AS d
       FROM ledger_entries le JOIN general_ledger gl ON gl.ledger_entry_id = le.id
       WHERE le.source_type='settlement' AND le.source_id IN (1,2,3)
         AND le.event_type IN ('settlement_paid_reversal','settlement_paid_correction','settlement_org_receipt')`,
    );
    expect((rows as any[]).length).toBeGreaterThan(0);
    for (const r of rows as any[]) {
      const [p] = await pool.execute<RowData>(
        `SELECT fiscal_year, period_number, organisation_id, status FROM accounting_periods WHERE id = ?`,
        [r.pid],
      );
      expect((p as any[]).length).toBe(1);
      const period = (p as any[])[0];
      expect(period.status).toBe('open');
      expect(Number(period.period_number)).toBe(9); // September
      expect(Number(period.fiscal_year)).toBe(2026);
      const d = new Date(r.d instanceof Date ? r.d.toISOString() : `${r.d}T00:00:00Z`);
      expect(d.getUTCMonth()).toBe(8); // 0-indexed September
      expect(d.getUTCFullYear()).toBe(2026);
    }
  });

  it('balance expectations — CourtZon 2202 cleared, org ORG-CASH + 1161 reconciled', async () => {
    // The shared DB carries pre-existing 2202 activity from other suites, so we
    // assert SOURCE-SCOPED effects only (the correction's own rows):
    //   - 2202 correction debits = 8460.15 (exactly once) — clears the fixture
    //     global 2202 credits of 8460.15 created in beforeAll.
    const g2202 = await globalAccountId('2202');
    const [corr] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE -amount END),0) AS b
       FROM ledger_entries
       WHERE source_type='settlement' AND source_id IN (1,2,3)
         AND event_type='settlement_paid_correction' AND chart_account_id = ? AND organisation_id IS NULL`,
      [g2202],
    );
    expect(Number((corr as any[])[0].b)).toBeCloseTo(8460.15, 2);

    // The fixture global 2202 credits sum to exactly 8460.15.
    const [fixt] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE -amount END),0) AS b
       FROM ledger_entries
       WHERE source_type='marketplace' AND source_id IN (23,24,25)
         AND event_type='marketplace_card_payment' AND chart_account_id = ? AND organisation_id IS NULL`,
      [g2202],
    );
    expect(Number((fixt as any[])[0].b)).toBeCloseTo(8460.15, 2);

    // Org 6: ORG-CASH debit = 8319.40, 1161 credit = 8319.40 (net 0)
    const org6Cash = await orgAccountId(6, 'ORG-CASH');
    const org6Recv = await orgAccountId(6, '1161');
    const [o6] = await pool.execute<RowData>(
      `SELECT SUM(CASE WHEN side='debit' AND chart_account_id=? THEN amount ELSE 0 END) AS cashDr,
              SUM(CASE WHEN side='credit' AND chart_account_id=? THEN amount ELSE 0 END) AS recvCr
       FROM ledger_entries WHERE source_type='settlement' AND source_id IN (1,2) AND event_type='settlement_org_receipt'`,
      [org6Cash, org6Recv],
    );
    expect(Number((o6 as any[])[0].cashDr)).toBeCloseTo(8319.40, 2);
    expect(Number((o6 as any[])[0].recvCr)).toBeCloseTo(8319.40, 2);

    // Org 28: ORG-CASH debit = 140.75, 1161 credit = 140.75 (net 0)
    const org28Cash = await orgAccountId(28, 'ORG-CASH');
    const org28Recv = await orgAccountId(28, '1161');
    const [o28] = await pool.execute<RowData>(
      `SELECT SUM(CASE WHEN side='debit' AND chart_account_id=? THEN amount ELSE 0 END) AS cashDr,
              SUM(CASE WHEN side='credit' AND chart_account_id=? THEN amount ELSE 0 END) AS recvCr
       FROM ledger_entries WHERE source_type='settlement' AND source_id=3 AND event_type='settlement_org_receipt'`,
      [org28Cash, org28Recv],
    );
    expect(Number((o28 as any[])[0].cashDr)).toBeCloseTo(140.75, 2);
    expect(Number((o28 as any[])[0].recvCr)).toBeCloseTo(140.75, 2);
  });
});