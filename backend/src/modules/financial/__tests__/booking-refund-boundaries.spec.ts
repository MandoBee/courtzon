import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * P4-08 — booking refund boundary coverage (snapshot proration + recovery capacity).
 *
 * `computeRefundEconomics` is the single source of booking refund economics for
 * accounting. It must:
 *   - prorate the PERSISTED snapshot (never recompute commission/tax/coach),
 *   - clamp the refund ratio to [0, 1] (no over-refund allocation),
 *   - return null when there is no economics to reverse,
 *   - split the coach/org share into settled (recoverable) vs unsettled using the
 *     REMAINING recovery capacity, so sequential refunds can never over-recover.
 *
 * Existing integration suites cover the happy path against MySQL; this suite
 * pins the arithmetic boundaries with a mocked pool (no database writes).
 */

const db = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: db.execute }),
}));

import { computeRefundEconomics } from '../application/booking-accounting.service.js';

const BOOKING_SQL = /FROM bookings WHERE id = \? LIMIT 1/;
const CAPACITY_SQL = /COALESCE\(coach_settled_amount, 0\)/;

interface Snapshot {
  total: number;
  tax: number;
  commission: number;
  club: number;
  coach: number;
  coachSettled?: number;
  coachRecovered?: number;
  orgSettled?: number;
  orgRecovered?: number;
}

function mockBooking(snapshot: Snapshot | null, capacity: { coachSettled?: number; coachRecovered?: number; orgSettled?: number; orgRecovered?: number } = {}) {
  db.execute.mockImplementation(async (sql: string) => {
    if (BOOKING_SQL.test(sql)) {
      if (!snapshot) return [[], []];
      return [[{
        id: 501,
        organisation_id: 77,
        series_id: null,
        total_amount: snapshot.total,
        tax_amount: snapshot.tax,
        commission_amount: snapshot.commission,
        club_amount: snapshot.club,
        coach_amount: snapshot.coach,
        payment_method: 'card',
      }], []];
    }
    if (CAPACITY_SQL.test(sql)) {
      return [[{
        coach_settled: capacity.coachSettled ?? 0,
        org_settled: capacity.orgSettled ?? 0,
        coach_recovered: capacity.coachRecovered ?? 0,
        org_recovered: capacity.orgRecovered ?? 0,
      }], []];
    }
    throw new Error(`unexpected SQL: ${sql}`);
  });
}

beforeEach(() => vi.clearAllMocks());

describe('P4-08 computeRefundEconomics — ratio boundaries', () => {
  it('clamps an over-refund to 100 % of the snapshot (never allocates more than the booking)', async () => {
    mockBooking({ total: 1000, tax: 0, commission: 100, club: 900, coach: 0 });

    const refund = (await computeRefundEconomics(501, 5000))!;

    expect(refund.refundRatio).toBe(1);
    expect(refund.refundedAmount).toBe(5000); // the request is echoed …
    expect(refund.orgAmount).toBe(900);       // … but the economics are capped
    expect(refund.commissionAmount).toBe(100);
    expect(refund.taxAmount).toBe(0);
    expect(refund.coachAmount).toBe(0);
  });

  it('a zero refund produces zero economics (no posting basis)', async () => {
    mockBooking({ total: 1000, tax: 0, commission: 100, club: 900, coach: 0 });

    const refund = (await computeRefundEconomics(501, 0))!;

    expect(refund.refundRatio).toBe(0);
    expect(refund.refundedAmount).toBe(0);
    expect(refund.orgAmount).toBe(0);
    expect(refund.commissionAmount).toBe(0);
    expect(refund.taxAmount).toBe(0);
    expect(refund.coachAmount).toBe(0);
  });

  it('prorates to 2 decimals from the persisted snapshot (rounded parts stay within the refund)', async () => {
    // grossPayable = club 285 + commission 10 + tax 5 = 300; refund 100 → 1/3.
    mockBooking({ total: 300, tax: 5, commission: 10, club: 285, coach: 0 });

    const refund = (await computeRefundEconomics(501, 100))!;

    expect(refund.orgAmount).toBe(95);
    expect(refund.commissionAmount).toBe(3.33);
    expect(refund.taxAmount).toBe(1.67);
    expect(Math.round((refund.orgAmount + refund.commissionAmount + refund.taxAmount) * 100) / 100).toBe(100);
  });

  it('returns null when the booking does not exist', async () => {
    mockBooking(null);
    await expect(computeRefundEconomics(404, 50)).resolves.toBeNull();
  });

  it('returns null when the booking has no payable economics', async () => {
    mockBooking({ total: 0, tax: 0, commission: 0, club: 0, coach: 0 });
    await expect(computeRefundEconomics(501, 50)).resolves.toBeNull();
  });
});

describe('P4-08 computeRefundEconomics — settled vs unsettled recovery capacity', () => {
  it('takes the settled share from the remaining capacity, never from the already-recovered amount', async () => {
    mockBooking(
      { total: 1000, tax: 0, commission: 100, club: 900, coach: 300 },
      { coachSettled: 300, coachRecovered: 285, orgSettled: 900, orgRecovered: 855 },
    );

    // Full refund: coach share 300, capacity 15 → recover 15, reverse 285 as unsettled.
    const refund = (await computeRefundEconomics(501, 1000))!;

    expect(refund.coachAmount).toBe(300);
    expect(refund.coachSettled).toBe(15);
    expect(refund.coachUnsettled).toBe(285);
    expect(refund.orgAmount).toBe(900);
    expect(refund.orgSettled).toBe(45);
    expect(refund.orgUnsettled).toBe(855);
  });

  it('exhausted capacity yields zero recovered and a fully unsettled reversal', async () => {
    mockBooking(
      { total: 1000, tax: 0, commission: 100, club: 900, coach: 300 },
      { coachSettled: 300, coachRecovered: 300, orgSettled: 900, orgRecovered: 900 },
    );

    const refund = (await computeRefundEconomics(501, 1000))!;

    expect(refund.coachSettled).toBe(0);
    expect(refund.coachUnsettled).toBe(300);
    expect(refund.orgSettled).toBe(0);
    expect(refund.orgUnsettled).toBe(900);
  });

  it('a wholly unsettled booking never reports a recovered share', async () => {
    mockBooking({ total: 1000, tax: 0, commission: 100, club: 900, coach: 300 });

    const refund = (await computeRefundEconomics(501, 500))!;

    expect(refund.coachSettled).toBe(0);
    expect(refund.coachUnsettled).toBe(150);
    expect(refund.orgSettled).toBe(0);
    expect(refund.orgUnsettled).toBe(450);
  });

  it('never reports a negative capacity when recovered exceeds settled (bad legacy data)', async () => {
    mockBooking(
      { total: 1000, tax: 0, commission: 100, club: 900, coach: 300 },
      { coachSettled: 100, coachRecovered: 150, orgSettled: 900, orgRecovered: 950 },
    );

    const refund = (await computeRefundEconomics(501, 1000))!;

    expect(refund.coachSettled).toBe(0);
    expect(refund.orgSettled).toBe(0);
    expect(refund.coachUnsettled).toBe(300);
    expect(refund.orgUnsettled).toBe(900);
  });
});
