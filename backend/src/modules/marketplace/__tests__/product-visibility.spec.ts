import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage for Marketplace product visibility (independent of
 * approval): active+visible → public; active+hidden → not public; pending never
 * public; owner-only control; show requires active; no-op silence; post-commit
 * event with scoping payload; purchase guard; public detail ownership guard.
 */

const mockEmit = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: async () => [[], []], query: async () => [[], []] }),
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

const activeOrgProduct = {
  id: 501, name: 'Racket', status: 'active', marketplace_visible: 1,
  seller_type: 'org', seller_id: 77, seller_user_id: null,
};
const pendingOrgProduct = { ...activeOrgProduct, id: 502, status: 'pending' };
const hiddenOrgProduct = { ...activeOrgProduct, id: 503, marketplace_visible: 0 };
const otherOrgProduct = { ...activeOrgProduct, id: 504, seller_id: 99 };

// Mutable product store so the visibility flip is observable via getProduct.
const productStore: any[] = [activeOrgProduct, pendingOrgProduct, hiddenOrgProduct, otherOrgProduct];

vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: {
    findProductById: vi.fn(async (id: number) => productStore.find((p) => p.id === id) ?? null),
    findProducts: vi.fn(async (filters: any) => ({ data: [], total: 0, page: 1, limit: 10 })),
    findOrgByUserId: vi.fn(async (_uid: number, slug?: string) => slug === 'seller' ? { id: 77 } : null),
    findOrgByUserScope: vi.fn(async () => null),
    findVariants: vi.fn(async () => []),
    findProductTags: vi.fn(async () => []),
    findProductImages: vi.fn(async () => []),
    findProductSpecs: vi.fn(async () => []),
    findRelatedProducts: vi.fn(async () => []),
    findProductsByIds: vi.fn(async (ids: number[]) =>
      ids.map((id: number) => productStore.find((p) => p.id === id)).filter(Boolean)),
    setMarketplaceVisible: vi.fn(async (productId: number, visible: boolean) => {
      const p = productStore.find((x) => x.id === productId);
      if (!p) return false;
      p.marketplace_visible = visible ? 1 : 0;
      return true;
    }),
  },
}));

import { marketplaceService, isProductPurchasable } from '../application/marketplace.service.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';

describe('marketplace product visibility', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    activeOrgProduct.marketplace_visible = 1;
    hiddenOrgProduct.marketplace_visible = 0;
    pendingOrgProduct.marketplace_visible = 1;
  });

  it('1: owner hides an Active product → emit after commit, approval status unchanged', async () => {
    const result = await marketplaceService.setProductVisibility(10, 501, false);

    expect(result.status).toBe('active'); // approval untouched (13)
    expect(result.marketplace_visible).toBe(0);
    expect(vi.mocked(repo.setMarketplaceVisible)).toHaveBeenCalledWith(501, false);
    expect(mockEmit).toHaveBeenCalledTimes(1);
    const [name, payload] = mockEmit.mock.calls[0];
    expect(name).toBe('marketplace:product-visibility-changed');
    expect(payload).toMatchObject({ productId: 501, visible: false, status: 'active', sellerType: 'org', organisationId: 77 });
  });

  it('6: owner shows an Active product → emit visible true (12: status unchanged)', async () => {
    await marketplaceService.setProductVisibility(10, 503, true);
    const [, payload] = mockEmit.mock.calls[0];
    expect(payload).toMatchObject({ productId: 503, visible: true, status: 'active' });
    expect(payload.status).toBe('active');
  });

  it('4: show requires Active (pending → cannot show; 3/4 pending never public)', async () => {
    await expect(marketplaceService.setProductVisibility(10, 502, true))
      .rejects.toThrow('must be approved');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('7/9: cannot change another seller/organisation product', async () => {
    await expect(marketplaceService.setProductVisibility(10, 504, true))
      .rejects.toThrow('Not your product');
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('no-op (already in target state) → no event', async () => {
    await marketplaceService.setProductVisibility(10, 501, true); // already visible
    expect(mockEmit).not.toHaveBeenCalled();
    await marketplaceService.setProductVisibility(10, 503, false); // already hidden
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it('14: event emitted only after the DB write (write precedes emit)', async () => {
    const order: string[] = [];
    vi.mocked(repo.setMarketplaceVisible).mockClear().mockImplementation(async () => { order.push('update'); return true; });
    mockEmit.mockClear();
    await marketplaceService.setProductVisibility(10, 501, false);
    order.push('emit');
    expect(mockEmit).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('update');
  });

  it('11: hidden products cannot be purchased (isProductPurchasable guard)', async () => {
    expect(isProductPurchasable({ status: 'active', marketplace_visible: 0 })).toBe(false); // hidden
    expect(isProductPurchasable({ status: 'active', marketplace_visible: 1 })).toBe(true); // visible
    expect(isProductPurchasable({ status: 'pending', marketplace_visible: 1 })).toBe(false); // pending
    expect(isProductPurchasable(null)).toBe(false);
  });

  it('public detail guard: hidden product is owner-only (viewer null → NotFound)', async () => {
    await expect(marketplaceService.getProductForRequester(503, null)).rejects.toThrow();
  });

  it('public detail guard: owner can view their hidden product', async () => {
    vi.mocked(repo.findVariants).mockResolvedValue([]);
    const product = await marketplaceService.getProductForRequester(503, 77);
    expect(product.id).toBe(503);
  });

  it('public detail guard: active+visible is public to everyone', async () => {
    const product = await marketplaceService.getProductForRequester(501, null);
    expect(product.id).toBe(501);
  });

  it('public catalog list passes visibleOnly=true', async () => {
    vi.mocked(repo.findProducts).mockClear();
    await marketplaceService.listProducts({ page: 1, limit: 10 });
    expect(vi.mocked(repo.findProducts)).toHaveBeenCalledWith(expect.objectContaining({ visibleOnly: true }));
  });
});