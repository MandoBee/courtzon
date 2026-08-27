import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

/**
 * F-13 — canonical wallet available balance.
 *
 * The backend /wallets/me response must expose the canonical available_balance
 * (= balance − reserved_balance) so the frontend renders backend-authoritative
 * availability and never reconstructs it client-side. The backend withdrawal
 * submit() remains the sole financial gate (FOR UPDATE + recompute + reject).
 */

const repoMock = vi.hoisted(() => ({ findByUserId: vi.fn() }));

vi.mock('../infrastructure/repositories/wallet.repository.js', () => ({
  walletRepository: repoMock,
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn(async () => [[], []]) }) }));
vi.mock('../../financial/application/transaction.service.js', () => ({ transactionService: {} }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn(), on: vi.fn() } }));
vi.mock('../../../shared/utils/feature-flags.js', () => ({ isFeatureEnabled: vi.fn(async () => true) }));
vi.mock('../../../shared/utils/logger.js', () => ({ createModuleLogger: vi.fn(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })) }));

const { WalletService } = await import('../application/wallet.service.js');

describe('F-13 — getMyWallet exposes canonical available_balance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns available_balance = balance − reserved_balance (single authority)', async () => {
    repoMock.findByUserId.mockResolvedValue({
      id: 1, user_id: 5, balance: 1000, reserved_balance: 200, currency_code: 'EGP', is_locked: false,
    });
    const svc = new WalletService();
    const wallet = await svc.getMyWallet(5);
    expect(wallet.balance).toBe(1000);
    expect(wallet.reserved_balance).toBe(200);
    expect(wallet.available_balance).toBe(800);
  });

  it('returns available_balance = balance when nothing is reserved', async () => {
    repoMock.findByUserId.mockResolvedValue({
      id: 1, user_id: 5, balance: 1000, reserved_balance: 0, currency_code: 'EGP', is_locked: false,
    });
    const svc = new WalletService();
    const wallet = await svc.getMyWallet(5);
    expect(wallet.available_balance).toBe(1000);
  });

  it('returns available_balance 0 when fully reserved', async () => {
    repoMock.findByUserId.mockResolvedValue({
      id: 1, user_id: 5, balance: 500, reserved_balance: 500, currency_code: 'EGP', is_locked: false,
    });
    const svc = new WalletService();
    const wallet = await svc.getMyWallet(5);
    expect(wallet.available_balance).toBe(0);
  });

  it('creates a zero wallet when none exists (available_balance 0)', async () => {
    repoMock.findByUserId.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 1, user_id: 5, balance: 0, reserved_balance: 0, currency_code: 'EGP', is_locked: false,
    });
    const svc = new WalletService();
    const wallet = await svc.getMyWallet(5);
    expect(wallet.available_balance).toBe(0);
  });
});