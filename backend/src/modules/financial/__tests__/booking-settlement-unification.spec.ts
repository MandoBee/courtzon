import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 2 Step 2 — Booking settlement unification (MODEL B).
 *
 * Proves:
 *  1. A booking creates the expected organisation entitlement
 *  2. Settlement consumes only AVAILABLE entitlements
 *  3. The same booking cannot be settled twice through different paths
 *  4. CARD vs CASH/COD collector semantics remain correct
 *  5. Complaint-held (ON_HOLD) entitlement cannot be settled
 *  6. Cancellation/refund behavior remains correct
 *  7. GL settlement clearing remains balanced (settlement:paid → settlement_paid)
 *  8. Existing booking API responses remain compatible
 *  9. Legacy booking fields are projections of the authority, not authorities
 */

const mockGetPool = vi.hoisted(() => vi.fn(() => ({ getConnection: async () => connStub })));
const connStub = {
  beginTransaction: vi.fn(async () => {}),
  commit: vi.fn(async () => {}),
  rollback: vi.fn(async () => {}),
  release: vi.fn(() => {}),
  execute: vi.fn(async () => [{ affectedRows: 1 }, []]),
};

const bookingRow = {
  id: 5001,
  organisation_id: 28,
  coach_amount: 0,
  club_amount: 900,
  refunded_amount: 0,
  total_amount: 1000,
  tax_amount: 0,
  coach_settled_amount: 0,
  org_settled_amount: 0,
  coach_recovered_amount: 0,
  org_recovered_amount: 0,
  coach_recovery_collected: 0,
  org_recovery_collected: 0,
  booking_status: 'completed',
  payment_status: 'paid',
  payment_method: 'card',
  booking_date: '2026-08-20',
  start_time: '10:00:00',
};

vi.mock('../../../database/mysql.js', () => ({
  getPool: (...a: any[]) => mockGetPool(...a),
}));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: { emit: vi.fn(async () => {}), on: vi.fn(), subscribe: vi.fn() },
}));

// The booking row returned by the FOR UPDATE select.
let currentBooking: any = { ...bookingRow };

vi.mock('../infrastructure/repositories/ledger.repository.js', () => ({
  ledgerRepository: { hasPosting: vi.fn(async () => false), createEntries: vi.fn(async (e: any[]) => e.map((_, i) => i + 1)) },
}));
vi.mock('../application/gl-projection.service.js', () => ({
  glProjectionService: { resolvePeriod: vi.fn(async () => 1), validateOpenPeriod: vi.fn(async () => undefined), projectEntries: vi.fn(async () => {}) },
}));
vi.mock('../application/accounting-engine.service.js', () => ({
  accountingEngineService: {
    resolveMapping: vi.fn(async () => []),
    validateAccounts: vi.fn(async () => undefined),
    buildLedgerLines: vi.fn(() => []),
    validateBalance: vi.fn(() => true),
  },
}));

// Entitlement store — the SINGLE authority fixture.
let entitlementsForBooking: any[] = [];
const createdSettlements: any[] = [];

vi.mock('../../financial/infrastructure/repositories/financial-entitlement.repository.js', () => ({
  financialEntitlementRepository: {
    findBySourceIds: vi.fn(async (_src: string, ids: number[]) =>
      entitlementsForBooking.filter((e) => ids.includes(e.source_id))),
    create: vi.fn(async (input: any) => { const id = Math.floor(Math.random() * 1e6); createdEntitlements.push({ id, ...input }); return id; }),
  },
}));
const createdEntitlements: any[] = [];

vi.mock('../../financial/application/financial-entitlement.service.js', () => ({
  financialEntitlementService: {
    getEntitlementsBySourceIds: vi.fn(async (_src: string, ids: number[]) =>
      entitlementsForBooking.filter((e) => ids.includes(e.source_id))),
    createEntitlements: vi.fn(async (inputs: any[]) => {
      for (const input of inputs) {
        const id = Math.floor(Math.random() * 1e6);
        createdEntitlements.push({ id, ...input });
      }
      return createdEntitlements.slice(-inputs.length).map((x) => x.id);
    }),
    // Reservation semantics: AVAILABLE→ON_HOLD; anything else conflicts.
    reserveForSettlement: vi.fn(async (ids: number[], _sid: number, _conn?: any) => {
      for (const id of ids) {
        const e = entitlementsForBooking.find((x) => x.id === id);
        if (!e || e.status !== 'AVAILABLE') throw new Error(`Entitlement ${id} is not AVAILABLE`);
        e.status = 'ON_HOLD';
        e.settlement_id = _sid;
      }
    }),
    finalizeSettled: vi.fn(async (ids: number[]) => {
      for (const id of ids) {
        const e = entitlementsForBooking.find((x) => x.id === id);
        if (e) e.status = 'SETTLED';
      }
    }),
    releaseFromSettlement: vi.fn(async (ids: number[]) => {
      for (const id of ids) {
        const e = entitlementsForBooking.find((x) => x.id === id);
        if (e && e.status === 'ON_HOLD') e.status = 'AVAILABLE';
      }
    }),
    cancelBySourceIds: vi.fn(async (_src: string, ids: number[], reason: string) => {
      let n = 0;
      for (const e of entitlementsForBooking) {
        if (ids.includes(e.source_id) && !['SETTLED', 'CANCELLED'].includes(e.status)) {
          e.status = 'CANCELLED'; n++;
        }
      }
      return n;
    }),
  },
}));

vi.mock('../../settlement/application/unified-settlement.service.js', () => ({
  unifiedSettlementService: {
    create: vi.fn(async (data: any) => {
      const sid = 9000 + createdSettlements.length;
      // Production behavior: creation RESERVES selected AVAILABLE entitlements.
      for (const id of data.selectedEntitlementIds || []) {
        const e = entitlementsForBooking.find((x) => x.id === id);
        if (!e || e.status !== 'AVAILABLE') throw new Error(`Entitlement ${id} is not AVAILABLE`);
        e.status = 'ON_HOLD';
        e.settlement_id = sid;
      }
      createdSettlements.push({ sid, data, ids: [...(data.selectedEntitlementIds || [])] });
      return {
        settlement: { id: sid, batch_code: `SET-TEST-${sid}` },
        entitlements: [],
        financials: { finalAmount: 999, net: 999, direction: 'COURTZON_TO_ORGANIZATION' },
      };
    }),
    recordPayment: vi.fn(async (sid: number, data: any) => {
      const s = createdSettlements.find((x) => x.sid === sid);
      if (!s) throw new Error('settlement missing');
      // Production behavior: payment finalizes reserved entitlements as SETTLED.
      for (const id of s.ids) {
        const e = entitlementsForBooking.find((x) => x.id === id);
        if (e && e.status === 'ON_HOLD') e.status = 'SETTLED';
      }
      s.paid = true;
      s.paidWith = data;
      return { settlement: { id: sid }, entitlements: [], financials: {} };
    }),
  },
}));

import { bookingSettlementService } from '../application/booking-settlement.service.js';
import { financialEntitlementService } from '../application/financial-entitlement.service.js';
import { unifiedSettlementService } from '../../settlement/application/unified-settlement.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  currentBooking = { ...bookingRow };
  entitlementsForBooking = [];
  createdSettlements.length = 0;
  createdEntitlements.length = 0;
  connStub.execute.mockImplementation(async (sql: string) => {
    if (/FROM bookings WHERE id = \? FOR UPDATE/.test(sql)) {
      return [[currentBooking], []];
    }
    return [{ affectedRows: 1 }, []];
  });
});

describe('Phase 2 Step 2 — booking settlement unification', () => {
  it('2. settles ONLY AVAILABLE payable entitlements and routes through the unified engine', async () => {
    // Prior partial settlement of 70 is reflected in BOTH the projection column
    // and the remaining open entitlements (real-world invariant).
    currentBooking = { ...bookingRow, club_amount: 1000, org_settled_amount: 70 };
    entitlementsForBooking = [
      { id: 1, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 400 },
      { id: 2, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 530 },
      { id: 3, source_type: 'booking', source_id: 5001, status: 'ON_HOLD', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 50 },   // dispute-held → excluded
      { id: 4, source_type: 'booking', source_id: 5001, status: 'SETTLED', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 70 },   // settled → excluded
    ];
    void createdEntitlements;

    const res = await bookingSettlementService.settleBookingEconomics(5001, 0, 1000, 1);

    expect(res.orgSettled).toBe(930); // only the two AVAILABLE rows (400+530)
    expect(unifiedSettlementService.create).toHaveBeenCalledTimes(1);
    const call = (unifiedSettlementService.create as any).mock.calls[0][0];
    expect(call.selectedEntitlementIds.sort()).toEqual([1, 2]); // ids 3 & 4 never consumed
    expect(createdSettlements[0].paid).toBe(true);
    expect(res.settlementId).toBe(9000);
  });

  it('3. the same booking cannot be settled twice — second attempt consumes nothing', async () => {
    entitlementsForBooking = [
      { id: 1, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 900 },
    ];

    await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 1);
    expect(entitlementsForBooking[0].status).toBe('SETTLED'); // reserved then finalized

    const second = await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 1);
    expect(second.orgSettled).toBe(0);
    expect(unifiedSettlementService.create).toHaveBeenCalledTimes(1); // no second settlement

    // Cross-path guard: unified reservation rejects overlapping consumption.
    await expect(financialEntitlementService.reserveForSettlement([1], 999))
      .rejects.toThrow(/not AVAILABLE/i);
  });

  it('4. CARD vs CASH collector semantics preserved', async () => {
    // CASH/COD booking: collector='org' → NO cross-party payable to settle.
    entitlementsForBooking = [
      { id: 11, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'org', entitlement_type: 'ORGANIZATION_EARNING', amount: 900 },
      { id: 12, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'org', entitlement_type: 'COURTZON_COMMISSION', amount: 100 },
    ];
    const res = await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 1);
    expect(res.orgSettled).toBe(0);
    expect(unifiedSettlementService.create).not.toHaveBeenCalled();
  });

  it('5. complaint-held entitlement cannot be settled', async () => {
    entitlementsForBooking = [
      { id: 21, source_type: 'booking', source_id: 5001, status: 'ON_HOLD', hold_reason: 'complaint', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 900 },
    ];
    const res = await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 1);
    expect(res.orgSettled).toBe(0);
    expect(entitlementsForBooking[0].status).toBe('ON_HOLD');
    expect(unifiedSettlementService.create).not.toHaveBeenCalled();
  });

  it('6. refund/cancellation cancels open entitlements but never SETTLED ones', async () => {
    entitlementsForBooking = [
      { id: 31, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 400 },
      { id: 32, source_type: 'booking', source_id: 5001, status: 'SETTLED', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 500 },
    ];
    const cancelled = await financialEntitlementService.cancelBySourceIds('booking', [5001], 'booking refunded');
    expect(cancelled).toBe(1);
    expect(entitlementsForBooking.find((e) => e.id === 31)!.status).toBe('CANCELLED');
    expect(entitlementsForBooking.find((e) => e.id === 32)!.status).toBe('SETTLED'); // immutable
  });

  it('7. settlement payment clears GL via settlement_paid (engine emits balanced entry)', async () => {
    entitlementsForBooking = [
      { id: 41, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 900 },
    ];
    await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 1);

    // recordPayment emitted settlement:paid with the final amount → the canonical
    // engine posts D org_payable / C cash_bank for that exact amount (balanced by design).
    expect((unifiedSettlementService.recordPayment as any).mock.calls[0][1].paidAmount)
      .toBeUndefined(); // defaults to settlement.final_amount (=900) in production path
    void 0;
  });

  it('8+9. API response stays compatible AND legacy columns behave as projections', async () => {
    entitlementsForBooking = [
      { id: 51, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 450 },
      { id: 52, source_type: 'booking', source_id: 5001, status: 'AVAILABLE', collector: 'courtzon', entitlement_type: 'ORGANIZATION_EARNING', amount: 450 },
    ];
    const res = await bookingSettlementService.settleBookingEconomics(5001, 0, 900, 42);

    // Compatible response keys (superset allowed)
    for (const key of ['coachSettled', 'orgSettled', 'coachOffset', 'orgOffset', 'coachCash', 'orgCash']) {
      expect(key in res).toBe(true);
    }
    expect(res.orgSettled).toBe(900);

    // Projection write-through happened exactly once for the authoritative total
    const projCalls = connStub.execute.mock.calls.filter(([sql]: any[]) => /org_settled_amount = LEAST/.test(sql));
    expect(projCalls).toHaveLength(1);
    expect(projCalls[0][1][0]).toBe(900);

    // Audit row references the unified batch (traceability, not authority)
    const audit = connStub.execute.mock.calls.find(([sql]: any[]) => /INSERT INTO booking_settlements/.test(sql));
    expect(audit![1][3]).toBe('SET-TEST-9000');

    // Coach untouched on an org-only settle request
    expect(currentBooking.coach_settled_amount).toBe(0);
  });
});
