import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Phase 2 Step 6 — Seller financial metrics clarification.
 *
 * Proves:
 *  - gross_sales_volume mirrors total_revenue (same source: order_items)
 *  - financial_position comes from PositionService (not order_items)
 *  - existing fields preserved for backward compatibility
 *  - multi-org aggregation works
 */

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn(() => ({ execute: vi.fn(async () => [[], []]) })) }));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: {} }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: {} }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));

const repoMock = vi.hoisted(() => ({} as Record<string, any>));
const mockGetSellerBalance = vi.hoisted(() => vi.fn(async () => ({ available_balance: 500, pending_fee: 50, unsettled_orders: 3 })));

vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: repoMock,
}));
vi.mock('../../financial/application/position.service.js', () => ({
  positionService: {
    getSellerBalanceSummary: mockGetSellerBalance,
  },
}));

import { marketplaceService } from '../application/marketplace.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  repoMock.findSellerOrgsForUser = vi.fn(async () => []);
});

describe('Phase 2 Step 6 — seller financial metrics', () => {
  it('returns sales metrics + gross_sales_volume + financial_position', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: 6, is_active: 1, owner_id: 68 }]);
    repoMock.getSellerStats = vi.fn(async () => ({
      total_orders: 10, completed_orders: 5, total_revenue: 5000,
      total_commission: 500, pending_orders: 3, active_listings: 20,
    }));

    const stats = await marketplaceService.getSellerStats(68);

    // Backward compat: all original fields preserved
    expect(stats.total_orders).toBe(10);
    expect(stats.completed_orders).toBe(5);
    expect(stats.total_revenue).toBe(5000);
    expect(stats.total_commission).toBe(500);
    expect(stats.pending_orders).toBe(3);
    expect(stats.active_listings).toBe(20);

    // New: clarified gross sales volume
    expect(stats.gross_sales_volume).toBe(5000);
    expect(stats.gross_sales_volume).toBe(stats.total_revenue); // same value

    // New: financial position from PositionService
    expect(stats.financial_position.available_balance).toBe(500);
    expect(stats.financial_position.pending_commission).toBe(50);
  });

  it('multi-org aggregation combines financial positions', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([
      { id: 6, is_active: 1, owner_id: 68 },
      { id: 1001133, is_active: 1, owner_id: 68 },
    ]);
    repoMock.getSellerStats = vi.fn(async () => ({
      total_orders: 20, completed_orders: 10, total_revenue: 8000,
      total_commission: 800, pending_orders: 5, active_listings: 40,
    }));

    const stats = await marketplaceService.getSellerStats(68);
    expect(stats.total_revenue).toBe(8000);
    // Both orgs queried
    expect(mockGetSellerBalance).toHaveBeenCalledTimes(2);
  });

  it('gross_sales_volume is NOT seller balance (different sources)', async () => {
    repoMock.findSellerOrgsForUser.mockResolvedValue([{ id: 6, is_active: 1, owner_id: 68 }]);
    repoMock.getSellerStats = vi.fn(async () => ({
      total_orders: 5, completed_orders: 3, total_revenue: 10000,
      total_commission: 1000, pending_orders: 1, active_listings: 10,
    }));

    const stats = await marketplaceService.getSellerStats(68);

    // Gross sales ≠ available balance — different concepts from different sources
    expect(stats.gross_sales_volume).toBe(10000);
    expect(stats.financial_position.available_balance).toBe(500);
    expect(stats.financial_position.available_balance).not.toBe(stats.gross_sales_volume);
  });
});
