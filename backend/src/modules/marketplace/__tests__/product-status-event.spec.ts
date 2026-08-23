import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage: admin product lifecycle transitions (approve/reject/
 * pause) must announce `marketplace:product-status-changed` AFTER the database
 * update commits, carrying seller identifiers so the socket publisher can
 * target the seller/organisation/consumer/admin audiences.
 */

const mockEmit = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: async () => [[], []] }),
}));
vi.mock('../../../database/database.transaction.js', () => ({
  withTransaction: vi.fn(async (fn: any) => fn({})),
}));
vi.mock('../../payment/application/payment.service.js', () => ({ paymentService: {} }));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({ paymentRepository: {} }));
vi.mock('../../financial/application/commission.service.js', () => ({ commissionService: {} }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../financial/infrastructure/transaction.repository.js', () => ({ transactionRepository: {} }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({ walletRepository: {} }));
vi.mock('../../auth/infrastructure/repositories/user.repository.js', () => ({ userRepository: {} }));
vi.mock('../../organisations/application/organisation.service.js', () => ({ organisationService: {} }));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: mockEmit, on: vi.fn() },
}));

const previousProduct = {
  id: 501,
  name: 'Padel Racket Pro',
  status: 'pending',
  seller_type: 'org',
  seller_id: 77,
  seller_user_id: 901,
};

vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: {
    findProductById: vi.fn(async (id: number) =>
      id === 501 ? { ...previousProduct } : null),
    adminUpdateProduct: vi.fn(async () => undefined),
    adminFindAllProducts: vi.fn(async () => []),
  },
}));
vi.mock('../../audit-log/index.js', () => ({ recordAudit: vi.fn() }));

import { marketplaceService } from '../application/marketplace.service.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';

describe('adminUpdateProductStatus → realtime announcement', () => {
  let currentStatus = 'pending';
  beforeEach(() => {
    mockEmit.mockClear();
    currentStatus = 'pending';
    vi.mocked(repo.findProductById).mockClear().mockImplementation(async () =>
      ({ ...previousProduct, status: currentStatus }));
    vi.mocked(repo.adminUpdateProduct).mockClear().mockImplementation(async (_id: number, data: any) => {
      currentStatus = data.status;
      return undefined;
    });
  });

  it('C+D: emits product-status-changed after the update with seller scoping payload', async () => {
    const updated = await marketplaceService.adminUpdateProductStatus(501, 'active');

    expect(updated.status).toBe('active');
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [name, payload] = mockEmit.mock.calls[0];
    expect(name).toBe('marketplace:product-status-changed');
    expect(payload).toMatchObject({
      productId: 501,
      name: 'Padel Racket Pro',
      previousStatus: 'pending',
      status: 'active',
      sellerType: 'org',
      organisationId: 77,
      sellerUserId: 901,
    });
    // Emit happens after the DB update has been issued (post-commit semantics)
    expect(vi.mocked(repo.adminUpdateProduct)).toHaveBeenCalledWith(501, { status: 'active' });
  });

  it('no transition (same status) → no event, no duplicate announcements', async () => {
    await marketplaceService.adminUpdateProductStatus(501, 'pending');
    expect(mockEmit).not.toHaveBeenCalled();
    expect(vi.mocked(repo.adminUpdateProduct)).not.toHaveBeenCalled();
  });
});
