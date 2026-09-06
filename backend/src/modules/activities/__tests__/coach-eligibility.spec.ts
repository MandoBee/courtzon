import { describe, it, expect } from 'vitest';
import { evaluateCoachEligibility } from '../domain/coach-eligibility.js';

/**
 * Coach service eligibility — the canonical branch policy rule.
 *
 * A coach may serve at a branch ONLY when BOTH hold:
 *   1. Explicit service access (coach_service_locations row).
 *   2. Branch policy satisfied:
 *      - independent_coaches_allowed → always eligible (given access).
 *      - contract_required → requires an accepted/active org agreement.
 */
describe('evaluateCoachEligibility', () => {
  it('independent branch + service access → eligible without an agreement', () => {
    expect(
      evaluateCoachEligibility({
        hasServiceAccess: true,
        branchPolicy: 'independent_coaches_allowed',
        hasAgreement: false,
      }),
    ).toEqual({
      eligible: true,
      reason: null,
      requiresServiceAccess: false,
      requiresAgreement: false,
    });
  });

  it('contract-required branch + service access + active agreement → eligible', () => {
    expect(
      evaluateCoachEligibility({
        hasServiceAccess: true,
        branchPolicy: 'contract_required',
        hasAgreement: true,
      }),
    ).toEqual({
      eligible: true,
      reason: null,
      requiresServiceAccess: false,
      requiresAgreement: false,
    });
  });

  it('no service access → not eligible on any branch policy', () => {
    const independent = evaluateCoachEligibility({
      hasServiceAccess: false,
      branchPolicy: 'independent_coaches_allowed',
      hasAgreement: false,
    });
    const contracted = evaluateCoachEligibility({
      hasServiceAccess: false,
      branchPolicy: 'contract_required',
      hasAgreement: true,
    });
    expect(independent.eligible).toBe(false);
    expect(independent.requiresServiceAccess).toBe(true);
    expect(contracted.eligible).toBe(false);
    expect(contracted.requiresServiceAccess).toBe(true);
  });

  it('contract-required branch + service access but no agreement → blocked on agreement', () => {
    const result = evaluateCoachEligibility({
      hasServiceAccess: true,
      branchPolicy: 'contract_required',
      hasAgreement: false,
    });
    expect(result.eligible).toBe(false);
    expect(result.requiresAgreement).toBe(true);
    expect(result.requiresServiceAccess).toBe(false);
    expect(result.reason).toContain('contract required');
  });

  it('agreement alone (without service access) never grants eligibility', () => {
    expect(
      evaluateCoachEligibility({
        hasServiceAccess: false,
        branchPolicy: 'contract_required',
        hasAgreement: true,
      }).eligible,
    ).toBe(false);
  });
});