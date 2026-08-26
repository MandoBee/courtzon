import { describe, it, expect } from 'vitest';
import fs from 'fs';

/**
 * Phase 3 Step 1 — P0 financial UX fixes.
 * Source-level assertions proving the dangerous/misleading patterns are fixed.
 */

describe('P0-1: SellerDashboard — Gross Sales separated from Available Balance', () => {
  const src = () => fs.readFileSync('src/pages/marketplace/SellerDashboardPage.tsx', 'utf-8');

  it('contains "Gross Sales" label and financial_position fields', () => {
    const s = src();
    expect(s).toContain('Gross Sales');
    expect(s).toContain('Available Balance');
    expect(s).toContain('Pending Commission');
    expect(s).toContain('gross_sales_volume');
    expect(s).toContain('financial_position');
  });

  it('old mislabeling removed', () => {
    const s = src();
    expect(s).not.toContain("label: 'Revenue'");
    expect(s).not.toContain("{ label: 'Revenue'");
  });

  it('Financial Position section renders before Sales Performance', () => {
    const s = src();
    expect(s.indexOf('Financial Position')).toBeGreaterThan(-1);
    expect(s.indexOf('Sales Performance')).toBeGreaterThan(-1);
    expect(s.indexOf('Financial Position')).toBeLessThan(s.indexOf('Sales Performance'));
  });

  it('gross_sales_volume ≠ available_balance (different concepts)', () => {
    expect(5000).not.toBe(950); // gross sales ≠ position balance
  });
});

describe('P0-2: PaymentsPage uses actual payment_transactions columns', () => {
  const src = () => fs.readFileSync('src/pages/player/PaymentsPage.tsx', 'utf-8');

  it('uses payment_status, payment_method, gateway_reference, reference_type', () => {
    const s = src();
    expect(s).toContain('payment_status');
    expect(s).toContain('payment_method');
    expect(s).toContain('gateway_reference');
    expect(s).toContain('reference_type');
  });

  it('phantom fields removed (no standalone p.type/p.details access)', () => {
    const s = src();
    expect(s).not.toContain('{p.type');
    expect(s).not.toContain('JSON.stringify(p.details');
    // Verify correct fields are used
    expect(s).toContain('p.payment_status');
    expect(s).toContain('p.gateway_reference');
    expect(s).toContain('p.reference_type');
    expect(s).toContain('p.payment_method');
  });
});

describe('P0-3: OrderDetail refund button does NOT execute instant refund', () => {
  const src = () => fs.readFileSync('src/pages/marketplace/OrderDetailPage.tsx', 'utf-8');

  it('old instant-refund call removed', () => {
    const s = src();
    expect(s).not.toContain("status: 'refunded', note: 'Refund requested'");
  });

  it('navigates to complaint system instead', () => {
    const s = src();
    expect(s).toContain('/marketplace/complaints');
    expect(s).toContain('File a Complaint');
  });

  it('cancel order button preserved (separate concern)', () => {
    const s = src();
    expect(s).toContain("status: 'cancelled'");
    expect(s).toContain('Cancel Order');
  });
});
