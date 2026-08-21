import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../wallet/infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: { findByUserId: vi.fn() },
}));
vi.mock('../../../shared/middleware/org-access.js', () => ({
  canAccessOrganisation: vi.fn(),
  isPlatformAdmin: vi.fn(),
}));

import { transactionRepository } from '../infrastructure/transaction.repository.js';
import { canAccessOrganisation, isPlatformAdmin } from '../../../shared/middleware/org-access.js';
import { transactionService as service } from '../application/transaction.service.js';

const mockFindById = vi.fn();
const mockIsUserTransaction = vi.fn();
const mockGetTransactionOrgIds = vi.fn();
transactionRepository.findById = mockFindById as any;
transactionRepository.isUserTransaction = mockIsUserTransaction as any;
transactionRepository.getTransactionOrgIds = mockGetTransactionOrgIds as any;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TransactionService.getTransaction (A7 ownership)', () => {
  const txn = { id: 5, type: 'wallet_topup', total_amount: 50 };

  it('returns the transaction for a platform admin (global access)', async () => {
    (isPlatformAdmin as any).mockResolvedValue(true);
    mockFindById.mockResolvedValue(txn);
    await expect(service.getTransaction(5, 99)).resolves.toBe(txn);
  });

  it('returns the transaction when the user owns the wallet entry', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    mockFindById.mockResolvedValue(txn);
    mockIsUserTransaction.mockResolvedValue(true);
    await expect(service.getTransaction(5, 7)).resolves.toBe(txn);
  });

  it('returns the transaction when the user has access to a referenced organisation', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    mockFindById.mockResolvedValue(txn);
    mockIsUserTransaction.mockResolvedValue(false);
    mockGetTransactionOrgIds.mockResolvedValue([42]);
    (canAccessOrganisation as any).mockResolvedValue(true);
    await expect(service.getTransaction(5, 7)).resolves.toBe(txn);
  });

  it('returns null for a user with no ownership relationship (caller 404s)', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    mockFindById.mockResolvedValue(txn);
    mockIsUserTransaction.mockResolvedValue(false);
    mockGetTransactionOrgIds.mockResolvedValue([42]);
    (canAccessOrganisation as any).mockResolvedValue(false);
    await expect(service.getTransaction(5, 7)).resolves.toBeNull();
  });

  it('returns null when the transaction does not exist', async () => {
    (isPlatformAdmin as any).mockResolvedValue(false);
    mockFindById.mockResolvedValue(null);
    await expect(service.getTransaction(404, 7)).resolves.toBeNull();
  });

  it('returns the transaction without a user id (system/internal call preserves old behaviour)', async () => {
    mockFindById.mockResolvedValue(txn);
    await expect(service.getTransaction(5, undefined)).resolves.toBe(txn);
  });
});