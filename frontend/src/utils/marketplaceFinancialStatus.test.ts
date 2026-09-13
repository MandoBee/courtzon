import { describe, it, expect } from 'vitest';
import { MARKETPLACE_FINANCIAL_STATUS_LABELS, financialStatusLabel } from './marketplaceFinancialStatus';

describe('PHASE 2 / GROUP 1 — marketplace financial-status presentation mapping', () => {
  it("financial_status 'Pending' renders 'Settlement Pending' (not payment-pending)", () => {
    expect(financialStatusLabel('Pending')).toBe('Settlement Pending');
  });

  it("financial_status 'Settled' still renders 'Settled'", () => {
    expect(financialStatusLabel('Settled')).toBe('Settled');
  });

  it('Available / Held / Cancelled labels are unchanged', () => {
    expect(financialStatusLabel('Available')).toBe('Available');
    expect(financialStatusLabel('Held')).toBe('Held');
    expect(financialStatusLabel('Cancelled')).toBe('Cancelled');
  });

  it('unknown/null values fall back to the raw value (no breaking change)', () => {
    expect(financialStatusLabel(null)).toBe('');
    expect(financialStatusLabel(undefined)).toBe('');
    expect(financialStatusLabel('FutureState')).toBe('FutureState');
  });

  it('the map contains exactly the 5 backend values', () => {
    expect(Object.keys(MARKETPLACE_FINANCIAL_STATUS_LABELS).sort()).toEqual([
      'Available', 'Cancelled', 'Held', 'Pending', 'Settled',
    ]);
  });
});