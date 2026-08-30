import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_DB: 0,
    DB_HOST: '127.0.0.1',
    DB_PORT: 3306,
    DB_USER: 'root',
    DB_PASSWORD: 'test',
    DB_NAME: 'courtzon_test',
  },
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(),
    on: vi.fn(), quit: vi.fn(),
  })),
  closeRedisClient: vi.fn(),
}));
vi.mock('../infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: {
    findSellerOrgsForUser: vi.fn(),
    isPlatformAdmin: vi.fn(),
    findOrderById: vi.fn(),
  },
}));

import { marketplaceService } from '../application/marketplace.service.js';
import { marketplaceRepository as repo } from '../infrastructure/repositories/marketplace.repository.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('MarketplaceService._getUserRoleInOrder (A2 no admin fallback)', () => {
  const order = {
    buyer_id: 1,
    items: [{ sellerId: 100 }],
  };

  it('returns buyer for the order buyer', async () => {
    await expect(marketplaceService._getUserRoleInOrder(1, order)).resolves.toBe('buyer');
  });

  it('returns seller when the user owns a seller org on the order', async () => {
    (repo.findSellerOrgsForUser as any).mockResolvedValue([{ id: 100, is_active: 1 }]);
    await expect(marketplaceService._getUserRoleInOrder(2, order)).resolves.toBe('seller');
  });

  it('returns admin ONLY for a genuine platform admin', async () => {
    (repo.findSellerOrgsForUser as any).mockResolvedValue([]);
    (repo.isPlatformAdmin as any).mockResolvedValue(true);
    await expect(marketplaceService._getUserRoleInOrder(3, order)).resolves.toBe('admin');
  });

  it('returns null for an unrelated user (no buyer/seller/admin relationship)', async () => {
    (repo.findSellerOrgsForUser as any).mockResolvedValue([]);
    (repo.isPlatformAdmin as any).mockResolvedValue(false);
    await expect(marketplaceService._getUserRoleInOrder(4, order)).resolves.toBeNull();
  });
});

describe('MarketplaceService._formatOrder sellerId mapping (findOrderById real shape)', () => {
  // findOrderById aliases oi.seller_id AS item_seller_id and exposes NO
  // top-level seller_id column (orders has no seller_id column). _formatOrder
  // must map item.sellerId from item_seller_id so the seller-role check in
  // _getUserRoleInOrder succeeds. Regression for the "Order not found" failure
  // on seller "Start Processing" (CASH + CREDIT).
  const rows = [
    { id: 9001, buyer_id: 1, status: 'confirmed', payment_status: 'paid',
      item_id: 1, item_seller_id: 100, product_id: 11, product_name: 'Racket',
      variant_id: null, quantity: 1, unit_price: 500, item_total: 500,
      commission_rate: 10, commission_amount: 50, shop_name: 'Shop', branch_id: null },
  ];

  beforeEach(() => {
    (repo.findOrderById as any).mockResolvedValue(rows);
  });

  it('maps item.sellerId from item_seller_id (no seller_id column in rows)', async () => {
    const formatted = await marketplaceService.getOrder(9001);
    expect(formatted.items).toBeDefined();
    expect(formatted.items[0].sellerId).toBe(100);
    expect(formatted.items[0].sellerId).toBeDefined();
  });

  it('seller is recognised through getOrder -> _getUserRoleInOrder when sellerId is undefined', async () => {
    // Sanity: without the mapping the seller check must still be exercised on
    // the real DB row shape (item_seller_id), not an absent seller_id field.
    (repo.findSellerOrgsForUser as any).mockResolvedValue([{ id: 100, is_active: 1 }]);
    const formatted = await marketplaceService.getOrder(9001);
    const role = await marketplaceService._getUserRoleInOrder(7, formatted);
    expect(role).toBe('seller');
  });
});
