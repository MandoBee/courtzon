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