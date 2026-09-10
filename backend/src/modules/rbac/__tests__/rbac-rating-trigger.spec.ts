import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const repo = vi.hoisted(() => ({
  getUserById: vi.fn(),
  updateUser: vi.fn(),
  getUserRoles: vi.fn(),
}));

const rating = vi.hoisted(() => ({ recalculateSelfDeclaredForUser: vi.fn() }));
const eventBus = vi.hoisted(() => ({ emit: vi.fn() }));
const loggerError = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    getConnection: async () => ({
      beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: async () => [[], []],
    }),
  }),
}));
vi.mock('../infrastructure/repositories/rbac.repository.js', () => ({ rbacRepository: repo }));
vi.mock('../../match-result/application/rating/rating.service.js', () => ({ ratingService: rating }));
vi.mock('../../../shared/event-bus/index.js', () => ({ eventBus }));
vi.mock('../../../shared/command/command-pipeline.js', () => ({ commandPipeline: { execute: vi.fn() } }));
vi.mock('../../booking/commands/cancel-booking.command.js', () => ({ cancelBookingHandler: vi.fn() }));
vi.mock('../../../shared/utils/logger.js', () => ({
  createModuleLogger: () => ({ error: loggerError, info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}));

import { rbacService } from '../application/rbac.service.js';

const USER = { id: 1, account_status: 'active', avatar_url: null };

beforeEach(() => {
  vi.clearAllMocks();
  repo.getUserById.mockResolvedValue(USER);
  repo.getUserRoles.mockResolvedValue([]);
  repo.updateUser.mockResolvedValue(true);
  rating.recalculateSelfDeclaredForUser.mockResolvedValue(undefined);
});

describe('Round 2/3 — self-declared immediate recalculation trigger', () => {
  it('mainLevelId change triggers immediate recalculation', async () => {
    await rbacService.updateUser(1, { mainLevelId: 4 });
    expect(rating.recalculateSelfDeclaredForUser).toHaveBeenCalledWith(1);
  });

  it('mainSportId change triggers immediate recalculation', async () => {
    await rbacService.updateUser(1, { mainSportId: 22 });
    expect(rating.recalculateSelfDeclaredForUser).toHaveBeenCalledWith(1);
  });

  it('mainLevelId and mainSportId together trigger exactly one recalculation', async () => {
    await rbacService.updateUser(1, { mainLevelId: 4, mainSportId: 22 });
    expect(rating.recalculateSelfDeclaredForUser).toHaveBeenCalledTimes(1);
  });

  it('unrelated profile updates do NOT trigger rating recalculation', async () => {
    await rbacService.updateUser(1, { fullName: 'Test User', bio: 'x' });
    expect(rating.recalculateSelfDeclaredForUser).not.toHaveBeenCalled();
  });

  it('identical repeated level update still triggers (idempotency inside rating service)', async () => {
    await rbacService.updateUser(1, { mainLevelId: 3 });
    await rbacService.updateUser(1, { mainLevelId: 3 });
    expect(rating.recalculateSelfDeclaredForUser).toHaveBeenCalledTimes(2);
  });

  it('failure path: user update still succeeds and the failure is logged (not silent)', async () => {
    rating.recalculateSelfDeclaredForUser.mockRejectedValue(new Error('rating db down'));
    const result = await rbacService.updateUser(1, { mainLevelId: 5 });
    // profile update succeeded despite rating failure
    expect(result).toEqual(expect.objectContaining({ id: 1 }));
    expect(loggerError).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error), userId: 1, mainLevelId: 5 }), 'self-declared rating recalculation failed after profile update');
  });
});