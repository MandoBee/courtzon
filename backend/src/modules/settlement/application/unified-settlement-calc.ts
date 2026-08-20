/**
 * Pure Unified Settlement calculation. No DB/event-bus imports — unit-testable.
 *
 * Financial Entitlements are the source of truth. Each AVAILABLE entitlement is
 * one of four types:
 *   ORGANIZATION_EARNING  (+)  — organization's share of a revenue event
 *   COURTZON_COMMISSION   (+)  — CourtZon's earned commission on a revenue event
 *   ORGANIZATION_ADJUSTMENT (−) — credit/debit to the organization's position
 *   COURTZON_ADJUSTMENT   (−)  — credit/debit to CourtZon's position
 *
 * The `collector` field records who originally collected the money:
 *   'courtzon' — player paid CourtZon (online/wallet); CourtZon holds the funds
 *   'org'      — player paid the organization (cash/COD); org holds the funds
 *
 * Settlement is between CourtZon and ONE organization. We compute the two
 * parties' obligations and net them:
 *
 *   courtzonOwedToOrg =
 *     Σ(ORGANIZATION_EARNING collected by courtzon) + Σ(ORGANIZATION_ADJUSTMENT collected by courtzon)
 *   orgOwedToCourtZon =
 *     Σ(COURTZON_COMMISSION collected by org) + Σ(COURTZON_ADJUSTMENT collected by org)
 *
 *   net = courtzonOwedToOrg − orgOwedToCourtZon
 *     net > 0  → COURTZON_TO_ORGANIZATION, |net|
 *     net < 0  → ORGANIZATION_TO_COURTZON, |net|
 *     net == 0 → ZERO_BALANCE, 0
 *
 * The selected entitlements must already be AVAILABLE (not ON_HOLD / SETTLED /
 * CANCELLED) and belong to the organization. Negative positions are carried as
 * obligations; a negative net balance is simply an org-to-courtzon obligation.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type SettlementDirectionType = 'COURTZON_TO_ORGANIZATION' | 'ORGANIZATION_TO_COURTZON' | 'ZERO_BALANCE';

export interface EntitlementFinancialInput {
  id: number;
  organisationId: number;
  entitlementType: 'ORGANIZATION_EARNING' | 'COURTZON_COMMISSION' | 'ORGANIZATION_ADJUSTMENT' | 'COURTZON_ADJUSTMENT';
  amount: number; // signed: earnings/commission positive, adjustments may be negative
  collector: 'courtzon' | 'org' | null;
}

export interface SettlementFinancialResult {
  courtzonOwedToOrg: number;   // amount CourtZon owes the organization
  orgOwedToCourtZon: number;   // amount the organization owes CourtZon
  net: number;                 // net = courtzonOwedToOrg − orgOwedToCourtZon
  direction: SettlementDirectionType;
  finalAmount: number;         // |net| (0 for ZERO_BALANCE)
  totalOrgEarnings: number;    // Σ ORGANIZATION_EARNING (all collectors)
  totalCommission: number;     // Σ COURTZON_COMMISSION (all collectors)
  totalOrgAdjustments: number; // Σ ORGANIZATION_ADJUSTMENT (all collectors)
  totalCourtZonAdjustments: number; // Σ COURTZON_ADJUSTMENT (all collectors)
}

export function computeSettlementFinancials(entitlements: EntitlementFinancialInput[]): SettlementFinancialResult {
  let courtzonOwedToOrg = 0;
  let orgOwedToCourtZon = 0;
  let totalOrgEarnings = 0;
  let totalCommission = 0;
  let totalOrgAdjustments = 0;
  let totalCourtZonAdjustments = 0;

  for (const ent of entitlements) {
    if (ent.entitlementType === 'ORGANIZATION_EARNING') {
      totalOrgEarnings += ent.amount;
      if (ent.collector === 'courtzon') courtzonOwedToOrg += ent.amount;
      // if collector === 'org', org already holds its own earning — no cross obligation
    } else if (ent.entitlementType === 'COURTZON_COMMISSION') {
      totalCommission += ent.amount;
      if (ent.collector === 'org') orgOwedToCourtZon += ent.amount;
      // if collector === 'courtzon', courtzon already holds its commission — no cross obligation
    } else if (ent.entitlementType === 'ORGANIZATION_ADJUSTMENT') {
      totalOrgAdjustments += ent.amount;
      if (ent.collector === 'courtzon') courtzonOwedToOrg += ent.amount;
    } else if (ent.entitlementType === 'COURTZON_ADJUSTMENT') {
      totalCourtZonAdjustments += ent.amount;
      if (ent.collector === 'org') orgOwedToCourtZon += ent.amount;
    }
  }

  courtzonOwedToOrg = round2(courtzonOwedToOrg);
  orgOwedToCourtZon = round2(orgOwedToCourtZon);
  const net = round2(courtzonOwedToOrg - orgOwedToCourtZon);

  let direction: SettlementDirectionType;
  let finalAmount: number;
  if (net > 0) {
    direction = 'COURTZON_TO_ORGANIZATION';
    finalAmount = net;
  } else if (net < 0) {
    direction = 'ORGANIZATION_TO_COURTZON';
    finalAmount = Math.abs(net);
  } else {
    direction = 'ZERO_BALANCE';
    finalAmount = 0;
  }

  return {
    courtzonOwedToOrg: round2(courtzonOwedToOrg),
    orgOwedToCourtZon: round2(orgOwedToCourtZon),
    net: round2(net),
    direction,
    finalAmount: round2(finalAmount),
    totalOrgEarnings: round2(totalOrgEarnings),
    totalCommission: round2(totalCommission),
    totalOrgAdjustments: round2(totalOrgAdjustments),
    totalCourtZonAdjustments: round2(totalCourtZonAdjustments),
  };
}