import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Step 12C — P2-1 + P2-2: remove dead financial fallbacks.
 *
 * P2-1: seller_net ?? (total − commission) fallbacks removed. seller_net is
 *       always provided by the backend (entitlement-derived). The frontend
 *       renders it directly; missing value shows a safe '—', never calculated.
 * P2-2: available_balance − pending_settlements subtraction removed.
 *       available_balance is already the canonical PositionService balance;
 *       pending_settlements is hardcoded 0 and not a financial position source.
 *
 * No financial arithmetic may be introduced in the frontend.
 */

const readFrontend = (rel: string) => fs.readFileSync(path.join(__dirname, rel), 'utf-8');

describe('P2-1: seller_net rendered directly (no arithmetic fallback)', () => {
  it('SellerDashboardPage renders backend seller_net directly', () => {
    const s = readFrontend('../marketplace/SellerDashboardPage.tsx');
    expect(s).toContain('order.seller_net != null ? formatPrice(Number(order.seller_net)');
  });

  it('SellerDashboardPage contains no total-minus-commission fallback', () => {
    const s = readFrontend('../marketplace/SellerDashboardPage.tsx');
    expect(s).not.toContain('seller_net ??');
    expect(s).not.toContain('total) - Number(order.commission_amount');
  });

  it('OrgOrdersPage renders backend seller_net directly', () => {
    const s = readFrontend('./OrgOrdersPage.tsx');
    expect(s).toContain('order.seller_net != null ? formatPrice(Number(order.seller_net)');
  });

  it('OrgOrdersPage contains no total-minus-commission fallback', () => {
    const s = readFrontend('./OrgOrdersPage.tsx');
    expect(s).not.toContain('seller_net ??');
    expect(s).not.toContain('total) - Number(order.commission_amount');
  });

  it('OrgOrderDetailPage renders backend seller_net directly', () => {
    const s = readFrontend('./OrgOrderDetailPage.tsx');
    expect(s).toContain('order.seller_net != null ? formatPrice(Number(order.seller_net)');
  });

  it('OrgOrderDetailPage contains no financial arithmetic fallback', () => {
    const s = readFrontend('./OrgOrderDetailPage.tsx');
    expect(s).not.toContain('seller_net ??');
    expect(s).not.toContain('total) - Number(order.commission_amount');
  });
});

describe('P2-2: available_balance rendered directly (no pending_settlements subtraction)', () => {
  it('SellerDashboardPage renders available_balance directly from the backend position', () => {
    const s = readFrontend('../marketplace/SellerDashboardPage.tsx');
    expect(s).toContain('Number(settlementBalance.available_balance).toFixed(2)');
  });

  it('SellerDashboardPage does not subtract pending_settlements', () => {
    const s = readFrontend('../marketplace/SellerDashboardPage.tsx');
    expect(s).not.toContain('available_balance) - Number(settlementBalance.pending_settlements');
    expect(s).not.toContain('available_balance - pending_settlements');
  });
});

describe('No unintended financial arithmetic introduced', () => {
  it('no seller_net ?? pattern remains in production code', () => {
    const files = ['../marketplace/SellerDashboardPage.tsx', './OrgOrdersPage.tsx', './OrgOrderDetailPage.tsx'];
    for (const f of files) {
      expect(readFrontend(f)).not.toContain('seller_net ??');
    }
  });

  it('existing gross-sales display remains gross sales (not seller earnings)', () => {
    const s = readFrontend('../marketplace/SellerDashboardPage.tsx');
    // Gross Sales is a distinct label; seller_net is shown separately.
    expect(s).toContain('Gross Sales');
    expect(s).toContain('seller.orders.seller_net');
  });

  it('Financial Position buckets remain intact (BalanceCard still used)', () => {
    const s = readFrontend('./FinancialPositionPage.tsx');
    expect(s).toContain('BUCKET_BORDER_COLORS');
    expect(s).toContain('BalanceCard');
    expect(s).toContain('data.balances.available.amount');
  });
});