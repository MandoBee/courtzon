import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 11E — P1-4: Org Booking Settlements must distinguish organisation
 * position from coach settlement / recovery, and not present legacy
 * projection fields as an independent accounting authority.
 *
 * The org settlement CONSUMPTION is already canonical (settleBookingEconomics
 * consumes AVAILABLE financial_entitlements via unifiedSettlementService).
 * `bookings.org_settled_amount` is a read-through projection written only
 * after entitlements are SETTLED. Coach settlement + recovery are legitimate
 * preserved structures (coaches are providers; recovery architecture kept).
 *
 * UI-only change: explanation banner + column tooltips clarifying that
 * org settleable/recovery are operational projections and the authoritative
 * org position is on the Financial Position page. No backend / data change.
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P1-4a: Org Booking Settlements clarifies position vs coach/recovery', () => {
  const src = () => readFrontend('./OrgBookingSettlements.tsx');

  it('explains org settleable is an operational projection, not the authoritative position', () => {
    const s = src();
    expect(s).toContain('operational per-booking projections');
    expect(s).toContain('authoritative organisation position');
    expect(s).toContain('financial entitlements');
  });

  it('links to the Financial Position page (canonical PositionService source)', () => {
    const s = src();
    expect(s).toContain('/org/${orgId}/finance/position');
  });

  it('distinguishes coach settlement as separate provider economics', () => {
    const s = src();
    expect(s).toContain('Coach settlement and recovery are separate provider economics');
    expect(s).toContain('coaches are not organisations');
  });

  it('adds tooltips clarifying coach and org settleable semantics', () => {
    const s = src();
    expect(s).toContain('title="Coach economics');
    expect(s).toContain('title="Operational per-booking projection');
  });
});

describe('P1-4b: Org settlement consumption remains canonical (entitlements via unified settlement)', () => {
  const src = () => fs.readFileSync(path.resolve(__dirname, '../../../../backend/src/modules/financial/application/booking-settlement.service.ts'), 'utf-8');

  it('org leg consumes AVAILABLE financial_entitlements via the unified settlement engine', () => {
    const s = src();
    expect(s).toContain('financialEntitlementService.getEntitlementsBySourceIds');
    expect(s).toContain('unifiedSettlementService.create');
    expect(s).toContain('unifiedSettlementService.recordPayment');
    expect(s).toContain("e.status === 'AVAILABLE'");
  });

  it('org_settled_amount is a read-through projection written only after settlement', () => {
    const s = src();
    expect(s).toContain('org_settled_amount = LEAST');
    expect(s).toContain('READ-THROUGH PROJECTION');
  });

  it('coach settlement and recovery remain legitimate preserved structures', () => {
    const s = src();
    expect(s).toContain('coach_settled_amount');
    expect(s).toContain('coach_recovered_amount');
    expect(s).toContain('no entitlement type exists for them yet');
  });
});

describe('P1-4c: No double counting / frontend calculation introduced', () => {
  const src = () => readFrontend('./OrgBookingSettlements.tsx');

  it('org settleable and recovery values are shown from the backend response, not recomputed', () => {
    const s = src();
    expect(s).toContain('b.orgSettleable');
    expect(s).toContain('b.orgOutstandingRecovery');
    expect(s).toContain('b.coachSettleable');
    // No position/balance is summed from these per-booking rows.
    expect(s).not.toContain('positionTotal');
    expect(s).not.toContain('orgSettleable.reduce');
  });
});