import { vi, describe, it, expect, beforeAll, afterAll } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test'; process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3021';
});

import mysql from 'mysql2/promise';
import type { RowDataPacket } from 'mysql2';
type RowData = RowDataPacket[];

/**
 * Revenue Account Separation.
 *
 * Booking organization-book revenue posts to the org-scoped Court Rental
 * Revenue account (MKT-COURT-REN), never Marketplace Sales Revenue
 * (MKT-SALES) — orgs keep booking rental revenue separate from marketplace
 * sales revenue, and separate from CourtZon's own commission accounts.
 *
 * (The settlement-offset clearing of 1161 Marketplace Receivable is covered by
 * financial-custody.spec.ts tests 7 & 14.)
 */
describe('Revenue Account Separation + Settlement Offset', () => {
  let pool: mysql.Pool;
  let orgId: number;

  // High fake source ids — never collide with real bookings.
  const BOOKING_CARD = 95000001;
  const BOOKING_CASH = 95000002;

  beforeAll(async () => {
    pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'root', password: 'courtzon2026', database: 'courtzon_v3', connectionLimit: 5, charset: 'utf8mb4' });
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'rev-sep-org')`);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id IN (SELECT id FROM organisations WHERE slug = 'rev-sep-org')`);
    await pool.execute(`DELETE FROM organisations WHERE slug = 'rev-sep-org'`);
    const [ot] = await pool.execute<RowData>('SELECT id FROM organisation_types LIMIT 1');
    const otId = (ot as any[])[0].id;
    const [o] = await pool.execute<RowData>(
      `INSERT INTO organisations (public_id, org_type_id, owner_id, name, slug, is_active) VALUES (UUID(), ?, 1, 'Rev Sep Org', 'rev-sep-org', 1)`,
      [otId],
    );
    orgId = (o as any).insertId;
  });

  afterAll(async () => {
    await pool.execute(`DELETE FROM ledger_entries WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM general_ledger WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM ledger_entries WHERE source_id IN (?, ?)`, [BOOKING_CARD, BOOKING_CASH]);
    await pool.execute(`DELETE FROM accounting_event_mapping_lines WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM chart_of_accounts WHERE organisation_id = ?`, [orgId]);
    await pool.execute(`DELETE FROM organisations WHERE id = ?`, [orgId]);
    await pool.end();
  });

  async function accountId(code: string, org: number | null = null): Promise<number> {
    const [rows] = await pool.execute<RowData>(
      org === null
        ? `SELECT id FROM chart_of_accounts WHERE organisation_id IS NULL AND code = ? LIMIT 1`
        : `SELECT id FROM chart_of_accounts WHERE organisation_id = ? AND code = ? LIMIT 1`,
      org === null ? [code] : [org, code],
    );
    expect(rows.length).toBe(1);
    return Number((rows as any[])[0].id);
  }

  async function sums(accountIdNum: number, sourceType: string, sourceId: number, org: number | null = null): Promise<{ credit: number; debit: number }> {
    const [rows] = await pool.execute<RowData>(
      `SELECT COALESCE(SUM(CASE WHEN side='credit' THEN amount ELSE 0 END),0) AS c,
              COALESCE(SUM(CASE WHEN side='debit' THEN amount ELSE 0 END),0) AS d
       FROM ledger_entries
       WHERE chart_account_id = ? AND source_type = ? AND source_id = ?
         AND ${org === null ? 'organisation_id IS NULL' : 'organisation_id = ?'}`,
      org === null ? [accountIdNum, sourceType, sourceId] : [accountIdNum, sourceType, sourceId, org],
    );
    return { credit: Number((rows as any[])[0].c), debit: Number((rows as any[])[0].d) };
  }

  it('booking CARD org book posts Court Rental Revenue (MKT-COURT-REN), not MKT-SALES', async () => {
    const { accountingEngineService } = await import('../application/accounting-engine.service.js');
    await accountingEngineService.provisionOrganisationMarketplaceAccounts(orgId);
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');

    // Card custody org book: Dr 1161 orgAmount + Dr commission expense / Cr court rental.
    await postAccountingEvent(
      'booking_org_receivable', 'booking', BOOKING_CARD, orgId,
      { marketplace_receivable: 90, commission_expense: 10, court_rental_revenue: 100 },
      'EGP', 'Card booking org book',
      undefined,
      { marketplace_receivable: orgId, commission_expense: orgId, court_rental_revenue: orgId },
    );

    const courtRentalId = await accountId('MKT-COURT-REN', orgId);
    const mktSalesId = await accountId('MKT-SALES', orgId);

    // Revenue credit lands on Court Rental Revenue, not Marketplace Sales Revenue.
    expect(await sums(courtRentalId, 'booking', BOOKING_CARD, orgId)).toMatchObject({ credit: 100, debit: 0 });
    expect(await sums(mktSalesId, 'booking', BOOKING_CARD, orgId)).toMatchObject({ credit: 0, debit: 0 });
  });

  it('booking COD org book posts Court Rental Revenue (MKT-COURT-REN), not MKT-SALES', async () => {
    const { postAccountingEvent } = await import('../application/accounting-event.listener.js');

    // Cash custody org book: Dr org Cash + Dr commission expense / Cr court rental + Cr courtzon payable.
    await postAccountingEvent(
      'booking_org_cash_receivable', 'booking', BOOKING_CASH, orgId,
      { org_cash_bank: 900, commission_expense: 200, court_rental_revenue: 900, courtzon_payable: 200 },
      'EGP', 'Cash booking org book',
      undefined,
      { org_cash_bank: orgId, commission_expense: orgId, court_rental_revenue: orgId, courtzon_payable: orgId },
    );

    const courtRentalId = await accountId('MKT-COURT-REN', orgId);
    const mktSalesId = await accountId('MKT-SALES', orgId);
    const orgCashId = await accountId('ORG-CASH', orgId);

    expect(await sums(courtRentalId, 'booking', BOOKING_CASH, orgId)).toMatchObject({ credit: 900, debit: 0 });
    expect(await sums(mktSalesId, 'booking', BOOKING_CASH, orgId)).toMatchObject({ credit: 0, debit: 0 });
    expect(await sums(orgCashId, 'booking', BOOKING_CASH, orgId)).toMatchObject({ credit: 0, debit: 900 });
  });
});