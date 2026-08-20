import { describe, it, expect } from 'vitest';
import { computeSettlementFinancials } from '../application/unified-settlement-calc.js';

const ent = (partial: any) => ({
  id: partial.id ?? 0,
  organisationId: partial.organisationId ?? 1,
  entitlementType: partial.entitlementType,
  amount: partial.amount,
  collector: partial.collector,
});

describe('Unified Settlement — financial calculation', () => {
  it('CourtZon collected online: CourtZon owes organization the org earning', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 900, collector: 'courtzon' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 100, collector: 'courtzon' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(900);
    expect(f.orgOwedToCourtZon).toBe(0);
    expect(f.direction).toBe('COURTZON_TO_ORGANIZATION');
    expect(f.finalAmount).toBe(900);
    expect(f.net).toBe(900);
  });

  it('Organization collected cash: organization owes CourtZon the commission', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 900, collector: 'org' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 100, collector: 'org' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(0);
    expect(f.orgOwedToCourtZon).toBe(100);
    expect(f.direction).toBe('ORGANIZATION_TO_COURTZON');
    expect(f.finalAmount).toBe(100);
    expect(f.net).toBe(-100);
  });

  it('Mixed cash + online position is netted', () => {
    // CourtZon collected 9000 org share; org collected 3000 commission → net 6000 courtzon→org.
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 9000, collector: 'courtzon' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 3000, collector: 'org' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(9000);
    expect(f.orgOwedToCourtZon).toBe(3000);
    expect(f.net).toBe(6000);
    expect(f.direction).toBe('COURTZON_TO_ORGANIZATION');
    expect(f.finalAmount).toBe(6000);
  });

  it('Positive organization adjustment participates (courtzon-collected)', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 1000, collector: 'courtzon' }),
      ent({ entitlementType: 'ORGANIZATION_ADJUSTMENT', amount: 500, collector: 'courtzon' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(1500);
    expect(f.finalAmount).toBe(1500);
  });

  it('Negative organization adjustment reduces the position', () => {
    // Org earning +5000 courtzon-collected, org adjustment -1000 courtzon-collected → courtzon owes 4000.
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 5000, collector: 'courtzon' }),
      ent({ entitlementType: 'ORGANIZATION_ADJUSTMENT', amount: -1000, collector: 'courtzon' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(4000);
    expect(f.finalAmount).toBe(4000);
    expect(f.direction).toBe('COURTZON_TO_ORGANIZATION');
  });

  it('CourtZon adjustment reduces CourtZon receivable (org-collected)', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 500, collector: 'org' }),
      ent({ entitlementType: 'COURTZON_ADJUSTMENT', amount: -100, collector: 'org' }),
    ]);
    expect(f.orgOwedToCourtZon).toBe(400);
    expect(f.finalAmount).toBe(400);
    expect(f.direction).toBe('ORGANIZATION_TO_COURTZON');
  });

  it('Negative carried balance: org owes CourtZon more than it is owed', () => {
    // Org earning +500 courtzon-collected, org adjustment -1000 courtzon-collected → net -500 org→courtZon.
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 500, collector: 'courtzon' }),
      ent({ entitlementType: 'ORGANIZATION_ADJUSTMENT', amount: -1000, collector: 'courtzon' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(-500);
    expect(f.net).toBe(-500);
    expect(f.direction).toBe('ORGANIZATION_TO_COURTZON');
    expect(f.finalAmount).toBe(500);
  });

  it('Zero net balance when obligations are equal', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 1000, collector: 'courtzon' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 1000, collector: 'org' }),
    ]);
    expect(f.net).toBe(0);
    expect(f.direction).toBe('ZERO_BALANCE');
    expect(f.finalAmount).toBe(0);
  });

  it('Empty selection yields zero balance', () => {
    const f = computeSettlementFinancials([]);
    expect(f.net).toBe(0);
    expect(f.direction).toBe('ZERO_BALANCE');
    expect(f.finalAmount).toBe(0);
  });

  it('Totals are computed correctly across mixed collectors', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 900, collector: 'courtzon' }),
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 100, collector: 'org' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 50, collector: 'courtzon' }),
      ent({ entitlementType: 'COURTZON_COMMISSION', amount: 50, collector: 'org' }),
      ent({ entitlementType: 'ORGANIZATION_ADJUSTMENT', amount: -100, collector: 'courtzon' }),
      ent({ entitlementType: 'COURTZON_ADJUSTMENT', amount: -20, collector: 'org' }),
    ]);
    expect(f.totalOrgEarnings).toBe(1000);
    expect(f.totalCommission).toBe(100);
    expect(f.totalOrgAdjustments).toBe(-100);
    expect(f.totalCourtZonAdjustments).toBe(-20);
    expect(f.courtzonOwedToOrg).toBe(800); // 900 - 100
    expect(f.orgOwedToCourtZon).toBe(30); // 50 - 20
    expect(f.net).toBe(770);
  });

  it('Rounds to 2 decimals', () => {
    const f = computeSettlementFinancials([
      ent({ entitlementType: 'ORGANIZATION_EARNING', amount: 1000.005, collector: 'courtzon' }),
    ]);
    expect(f.courtzonOwedToOrg).toBe(1000.01);
  });
});