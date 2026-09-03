import { describe, it, expect, beforeAll, afterAll } from 'vitest';

process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3002';

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Marketplace / Organisation Settlement Receipt — Integration
 *
 * Verifies the corrected unified settlement accounting model:
 *   1. The CourtZon book payout (Dr Merchant Payable 2202 / Cr Cash-Bank 1120)
 *      is ALWAYS organisation_id = NULL — it never leaks into an organisation's
 *      accounting records.
 *   2. A NEW org-scoped settlement receipt is posted alongside it:
 *      Dr org Cash/Bank / Cr org 1161 Marketplace Receivable, clearing the
 *      org's marketplace receivable in ITS OWN book.
 *   3. OTC (org_to_courtzon) settlements post NO org receipt.
 *   4. Multiple organisations' settlement postings are isolated (no bleed).
 *   5. Re-dispatch of the same settlement is idempotent (no double-posting).
 *
 * All assertions are SOURCE-SCOPED (they inspect the exact ledger rows created
 * for a given settlement id), never global account balance deltas. This makes
 * the tests deterministic even when other integration specs run concurrently
 * against the same shared MySQL database.
 *
 * The in-memory `settlement:paid` handler is fire-and-forget (the event bus
 * does NOT await it), so every emit is followed by polling until the expected
 * ledger rows appear.
 */
describe('Marketplace / Org Settlement Receipt Accounting', () => {
  let pool: mysql.Pool;
  let orgA: number;
  let orgB: number;
  const SID_A = 990201;
  const SID_B = 990203;
  const SID_OTC = 990202;
  const SIDS = [990201, 990202, 990203, 990204, 990205];

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });

    for (const slug of ['settle-receipt-a', 'settle-receipt-b']) {
      await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = ?)`, [slug]);
      await pool.execute(`DELETE FROM organisations WHERE slug = ?`, [slug]);
    }
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (${SIDS.join(',')})`);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE event_type='settlement_org_receipt'`);

    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [a] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Settle Receipt A', 'settle-receipt-a', 1)`,
      [otId],
    );
    orgA = (a as any).insertId;
    const [b] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Settle Receipt B', 'settle-receipt-b', 1)`,
      [otId],
    );
    orgB = (b as any).insertId;

    const { registerAccountingEventListeners } = await import('../application/accounting-event.listener.js');
    // Idempotent registration: whoever registers first in this worker wins once,
    // so exactly ONE settlement:paid handler exists (no duplicate-handler races).
    registerAccountingEventListeners();
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id IN (?, ?)`, [orgA, orgB]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_type='settlement' AND source_id IN (${SIDS.join(',')})`);
    await pool.execute(`DELETE FROM organisations WHERE id IN (?, ?)`, [orgA, orgB]);
    await pool.end();
  });

  interface Row { eventType: string; orgId: number | null; side: string; amount: number; code: string; }

  // Source-scoped read of the exact ledger rows for a settlement (sids default
  // to all of this suite's ids) — immune to other specs' concurrent writes.
  async function rowsFor(sid: number): Promise<Row[]> {
    const [rows] = await pool.execute<RowData>(
      `SELECT le.event_type AS eventType, le.organisation_id AS orgId, le.side AS side,
              le.amount AS amount, a.code AS code
       FROM ledger_entries le LEFT JOIN chart_of_accounts a ON a.id = le.chart_account_id
       WHERE le.source_type = 'settlement' AND le.source_id = ?
       ORDER BY le.event_type, le.side, a.code`,
      [sid],
    );
    return (rows as any[]).map((r) => ({ ...r, amount: Number(r.amount), orgId: r.orgId == null ? null : Number(r.orgId) }));
  }

  async function countEvent(sid: number, eventType: string, orgId: number | null): Promise<number> {
    const rows = await rowsFor(sid);
    return rows.filter((r) => r.eventType === eventType && r.orgId === orgId).length;
  }

  // Poll until `fn` resolves truthy (default 8s). The fire-and-forget handler
  // posts async, so we never rely on a fixed sleep.
  async function waitFor(fn: () => Promise<boolean>, label = 'condition', timeout = 8000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await fn()) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`timeout waiting for: ${label}`);
  }

  async function emitSettlement(sid: number, amount: number, direction: string, orgId: number | null): Promise<void> {
    const { eventBusV2 } = await import('../../../shared/event-bus/event-bus.v2.js');
    await eventBusV2.emit('settlement:paid', {
      settlementId: sid, amount, direction, organisationId: orgId, currency: 'EGP',
    } as any);
  }

  it('1. CourtZon payout is org NULL (Dr 2202 / Cr 1120); org receipt is org-scoped (Dr ORG-CASH / Cr 1161)', async () => {
    await emitSettlement(SID_A, 100, 'courtzon_to_org', orgA);

    // Wait until BOTH the CourtZon book post and the org receipt are durable.
    await waitFor(async () => (await countEvent(SID_A, 'settlement_paid', null)) === 2, 'CourtZon post');
    await waitFor(async () => (await countEvent(SID_A, 'settlement_org_receipt', orgA)) === 2, 'org receipt posted');

    const rows = await rowsFor(SID_A);

    // CourtZon book: Dr 2202 Merchant Payable 100 / Cr 1120 Cash 100, org NULL.
    const courtzon = rows.filter((r) => r.eventType === 'settlement_paid');
    expect(courtzon.length).toBe(2);
    expect(courtzon.every((r) => r.orgId === null)).toBe(true);
    expect(courtzon.find((r) => r.side === 'debit' && r.code === '2202')?.amount).toBe(100);
    expect(courtzon.find((r) => r.side === 'credit' && r.code === '1120')?.amount).toBe(100);
    // No CourtZon-book line is stamped with the organisation id (no leak).
    expect(courtzon.some((r) => r.orgId === orgA)).toBe(false);
    // CourtZon's own 1161 (receivable_from_org) is untouched by the payout.
    expect(courtzon.some((r) => r.code === '1161' && r.orgId === null)).toBe(false);

    // Org receipt: Dr org ORG-CASH 100 / Cr org 1161 100, org-scoped to orgA.
    const receipt = rows.filter((r) => r.eventType === 'settlement_org_receipt');
    expect(receipt.length).toBe(2);
    expect(receipt.every((r) => r.orgId === orgA)).toBe(true);
    expect(receipt.find((r) => r.side === 'debit' && r.code === 'ORG-CASH')?.amount).toBe(100);
    expect(receipt.find((r) => r.side === 'credit' && r.code === '1161')?.amount).toBe(100);
  });

  it('2. re-dispatch is idempotent (no double-posting)', async () => {
    // Re-emit the SAME settlement already posted in test 1.
    await emitSettlement(SID_A, 100, 'courtzon_to_org', orgA);
    await new Promise(r => setTimeout(r, 600));

    // The CourtZon post and org receipt line counts must be UNCHANGED.
    expect(await countEvent(SID_A, 'settlement_paid', null)).toBe(2);
    expect(await countEvent(SID_A, 'settlement_org_receipt', orgA)).toBe(2);
    expect(await rowsFor(SID_A)).toHaveLength(4);
  });

  it('3. OTC (org_to_courtzon) posts NO org receipt', async () => {
    await emitSettlement(SID_OTC, 100, 'org_to_courtzon', orgA);
    await waitFor(async () => (await countEvent(SID_OTC, 'settlement_paid_otc', null)) === 2, 'OTC CourtZon post');

    // OTC posts CourtZon book (Dr 1120 / Cr 1160) but NO org-scoped org receipt.
    const rows = await rowsFor(SID_OTC);
    expect(await countEvent(SID_OTC, 'settlement_org_receipt', orgA)).toBe(0);
    expect(rows.every((r) => r.orgId === null)).toBe(true); // no leak into org book
    expect(rows.find((r) => r.side === 'debit' && r.code === '1120')?.amount).toBe(100);
    expect(rows.find((r) => r.side === 'credit' && r.code === '1160')?.amount).toBe(100);
  });

  it('4. organisations are isolated — org B does not see org A receipt', async () => {
    await emitSettlement(SID_B, 50, 'courtzon_to_org', orgB);
    await waitFor(async () => (await countEvent(SID_B, 'settlement_org_receipt', orgB)) === 2, 'org B receipt posted');

    // Org B's receipt is org-scoped to orgB.
    const bRows = await rowsFor(SID_B);
    const bReceipt = bRows.filter((r) => r.eventType === 'settlement_org_receipt');
    expect(bReceipt.length).toBe(2);
    expect(bReceipt.every((r) => r.orgId === orgB)).toBe(true);
    expect(bReceipt.find((r) => r.side === 'debit' && r.code === 'ORG-CASH')?.amount).toBe(50);

    // Org A's receipt (from test 1) is unchanged: exactly 2 org-scoped lines of 100.
    const aReceipt = (await rowsFor(SID_A)).filter((r) => r.eventType === 'settlement_org_receipt');
    expect(aReceipt.length).toBe(2);
    expect(aReceipt.find((r) => r.side === 'credit' && r.code === '1161')?.amount).toBe(100);
    // And no orgB line bleeds into orgA's book.
    expect(aReceipt.some((r) => r.orgId === orgB)).toBe(false);
    // The CourtZon book post for org A is still exactly one posting (2 lines).
    expect(await countEvent(SID_A, 'settlement_paid', null)).toBe(2);
  });
});
