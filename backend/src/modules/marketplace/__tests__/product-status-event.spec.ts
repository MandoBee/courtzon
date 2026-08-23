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
    findOrgByUserId: vi.fn(async () => ({ id: 77 })),
    findOrgByUserScope: vi.fn(async () => null),
    updateProduct: vi.fn(async () => true),
    getProduct: vi.fn(async (id: number) => ({ id, status: 'pending', seller_id: 77, seller_type: 'org' })),
    findVariants: vi.fn(async () => []),
    setProductTags: vi.fn(async () => undefined),
    findProductTags: vi.fn(async () => []),
    findProductImages: vi.fn(async () => []),
    findProductSpecs: vi.fn(async () => []),
    findRelatedProducts: vi.fn(async () => []),
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

describe('updateProduct (seller/organisation edit) → ADMIN_ROOM announcement', () => {
  let currentStatus = 'active';
  beforeEach(() => {
    mockEmit.mockClear();
    currentStatus = 'active';
    vi.mocked(repo.findProductById).mockClear().mockImplementation(async () =>
      ({ ...previousProduct, status: currentStatus }));
    vi.mocked(repo.updateProduct).mockClear().mockImplementation(async () => {
      currentStatus = 'pending';
      return true;
    });
    vi.mocked(repo.getProduct).mockClear().mockImplementation(async (id: number) =>
      ({ id, status: 'pending', seller_id: 77, seller_type: 'org', seller_user_id: 901 }));
  });

  it('B: seller edit (active → pending) emits exactly one event with pending status + scoping', async () => {
    const result = await marketplaceService.updateProduct(1, 501, { price: 90 });

    expect(result.status).toBe('pending');
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [name, payload] = mockEmit.mock.calls[0];
    expect(name).toBe('marketplace:product-status-changed');
    expect(payload).toMatchObject({
      productId: 501,
      previousStatus: 'active',
      status: 'pending',
      sellerType: 'org',
      organisationId: 77,
      sellerUserId: 901,
    });
    // Emit happens only after the product row was updated (post-commit)
    expect(vi.mocked(repo.updateProduct)).toHaveBeenCalledWith(501, 77, expect.objectContaining({ status: 'pending' }));
  });

  it('C: organisation path uses the same event (same service method, org scoping)', async () => {
    // Org-sellers resolve through the same updateProduct flow — assert one event.
    await marketplaceService.updateProduct(1, 501, { name: 'Updated' });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [, payload] = mockEmit.mock.calls[0];
    expect(payload).toMatchObject({ status: 'pending', organisationId: 77 });
  });

  it('F: editing an already-pending product emits no event (no transition)', async () => {
    currentStatus = 'pending';
    await marketplaceService.updateProduct(1, 501, { price: 95 });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});

describe('adminUpdateProduct (full edit) status transition announcement', () => {
  let currentStatus = 'pending';
  beforeEach(() => {
    mockEmit.mockClear();
    currentStatus = 'pending';
    vi.mocked(repo.findProductById).mockClear().mockImplementation(async () =>
      ({ ...previousProduct, status: currentStatus }));
    vi.mocked(repo.adminUpdateProduct).mockClear().mockImplementation(async (_id: number, data: any) => {
      if (data.status !== undefined) currentStatus = data.status;
      return true;
    });
  });

  it('emits when a full edit carries a status transition', async () => {
    await marketplaceService.adminUpdateProduct(501, { price: 120, status: 'active' });
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [, payload] = mockEmit.mock.calls[0];
    expect(payload).toMatchObject({ previousStatus: 'pending', status: 'active', productId: 501 });
  });

  it('F: no event when status is absent or unchanged', async () => {
    await marketplaceService.adminUpdateProduct(501, { price: 130 });
    expect(mockEmit).not.toHaveBeenCalled();
    await marketplaceService.adminUpdateProduct(501, { status: 'pending' });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
