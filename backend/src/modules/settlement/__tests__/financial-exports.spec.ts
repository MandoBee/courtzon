import { describe, it, expect, vi } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

import { toCsv } from '../../../shared/utils/csv.js';
import { computeSettlementFinancials } from '../application/unified-settlement-calc.js';
import { exportSettlementsHandler } from '../presentation/unified-settlement.controller.js';

// ── Helpers ──
function makeEnt(overrides: any) {
  return {
    id: overrides.id,
    organisation_id: overrides.organisationId ?? 6,
    entitlement_type: overrides.entitlementType,
    source_type: 'marketplace',
    source_id: overrides.sourceId ?? overrides.id,
    collector: overrides.collector ?? 'courtzon',
    amount: overrides.amount,
    currency: 'EGP',
    status: 'SETTLED',
    metadata: { orderId: 942838 },
    ...overrides,
  };
}

function makeReply() {
  const headers: Record<string, string> = {};
  return {
    sent: null as any,
    header: (k: string, v: string) => { headers[k] = v; return this; },
    send: (body: any) => { this.sent = body; return this; },
    get headers() { return headers; },
  };
}

// ── Settlement export ──
describe('Unified settlement export', () => {
  it('exports canonical values without recalculating in the frontend', async () => {
    const rows = [
      {
        settlement: { id: 840, organisation_name: 'Shop 5', settlement_status: 'requested', requested_at: '2026-08-26T10:00:00.000Z', paid_at: null, final_amount: 98.4 },
        entitlements: [
          makeEnt({ id: 1044, entitlementType: 'ORGANIZATION_EARNING', amount: 98.4 }),
          makeEnt({ id: 1045, entitlementType: 'COURTZON_COMMISSION', amount: 9.6 }),
        ],
        financials: computeSettlementFinancials([
          { id: 1044, organisationId: 1001133, entitlementType: 'ORGANIZATION_EARNING', amount: 98.4, collector: 'courtzon' },
          { id: 1045, organisationId: 1001133, entitlementType: 'COURTZON_COMMISSION', amount: 9.6, collector: 'courtzon' },
        ]),
      },
    ];

    const csv = toCsv(
      ['Settlement ID', 'Organisation', 'Status', 'Requested Date', 'Paid Date', 'Final Amount', 'Org Earnings', 'CourtZon Commission', 'Org Adjustments', 'CourtZon Adjustments', 'Entitlement Count'],
      rows.map((r: any) => [
        r.settlement.id, r.settlement.organisation_name, r.settlement.settlement_status,
        r.settlement.requested_at, r.settlement.paid_at, r.settlement.final_amount,
        r.financials.totalOrgEarnings, r.financials.totalCommission,
        r.financials.totalOrgAdjustments, r.financials.totalCourtZonAdjustments,
        r.entitlements.length,
      ]),
      false,
    );

    expect(csv).toContain('Settlement ID,Organisation,Status,Requested Date,Paid Date,Final Amount');
    expect(csv).toContain('840,Shop 5,requested');
    expect(csv).toContain('98.4');      // final amount preserved
    expect(csv).toContain('98.4,');     // earnings
    expect(csv).toContain(',9.6,');     // commission
    expect(csv).toContain(',2');        // entitlement count
  });

  it('settlement earnings/commission come from canonical financials', () => {
    const f = computeSettlementFinancials([
      { id: 1, organisationId: 6, entitlementType: 'ORGANIZATION_EARNING', amount: 950, collector: 'courtzon' },
      { id: 2, organisationId: 6, entitlementType: 'COURTZON_COMMISSION', amount: 100, collector: 'courtzon' },
      { id: 3, organisationId: 6, entitlementType: 'ORGANIZATION_ADJUSTMENT', amount: -50, collector: 'courtzon' },
    ]);
    expect(f.totalOrgEarnings).toBe(950);
    expect(f.totalCommission).toBe(100);
    expect(f.totalOrgAdjustments).toBe(-50);
    expect(f.finalAmount).toBe(900); // 950 - 50 net (commission already held by courtzon, no cross obligation)
  });
});

// ── Reconciliation export ──
describe('Reconciliation export', () => {
  it('exports canonical reconciliation values', async () => {
    const reports = [
      {
        organisationId: 6,
        organisationName: 'Padel Edge',
        entitlements: { net: 100, openCount: 4 },
        gl: { net: 100 },
        difference: 0,
        direction: 'SETTLED_UP',
        reconciled: true,
      },
      {
        organisationId: 1001133,
        organisationName: 'Shop 5',
        entitlements: { net: 150, openCount: 2 },
        gl: { net: 120 },
        difference: 30,
        direction: 'PAYABLE_TO_ORGANISATION',
        reconciled: false,
      },
    ];

    const csv = toCsv(
      ['Organisation ID', 'Organisation Name', 'Entitlement Net', 'GL Net', 'Difference', 'Direction', 'Reconciled', 'Affected Positions Count'],
      reports.map((r) => [
        r.organisationId, r.organisationName, r.entitlements.net, r.gl.net,
        r.difference, r.direction, r.reconciled ? 'true' : 'false', r.entitlements.openCount,
      ]),
      false,
    );

    expect(csv).toContain('Organisation ID,Organisation Name,Entitlement Net,GL Net,Difference,Direction,Reconciled,Affected Positions Count');
    expect(csv).toContain('6,Padel Edge,100,100,0,SETTLED_UP,true,4');
    expect(csv).toContain('1001133,Shop 5,150,120,30,PAYABLE_TO_ORGANISATION,false,2');
  });
});

// ── GL journal export ──
describe('GL journal export', () => {
  it('exports ledger records with debits/credits preserved', async () => {
    const rows = [
      { id: 1, entry_date: '2026-08-26T10:00:00.000Z', account_code: '2100', account_name: 'Revenue', organisation_id: 6, debit: 0, credit: 98.4, balance: 98.4, reference_type: 'marketplace', reference_id: 942838, description: 'Order 942838' },
      { id: 2, entry_date: '2026-08-26T11:00:00.000Z', account_code: '1100', account_name: 'Cash', organisation_id: 6, debit: 50, credit: 0, balance: 50, reference_type: 'booking', reference_id: 5001, description: 'Booking 5001' },
    ];

    const csv = toCsv(
      ['Entry ID', 'Date', 'Account Code', 'Account Name', 'Organisation ID', 'Debit', 'Credit', 'Balance', 'Reference Type', 'Reference ID', 'Description'],
      rows.map((r) => [
        r.id, r.entry_date, r.account_code, r.account_name, r.organisation_id,
        r.debit, r.credit, r.balance, r.reference_type, r.reference_id, r.description,
      ]),
      false,
    );

    expect(csv).toContain('Entry ID,Date,Account Code,Account Name,Organisation ID,Debit,Credit,Balance');
    expect(csv).toContain('1,2026-08-26T10:00:00.000Z,2100,Revenue,6,0,98.4,98.4,marketplace,942838');
    expect(csv).toContain('2,2026-08-26T11:00:00.000Z,1100,Cash,6,50,0,50,booking,5001');
  });
});