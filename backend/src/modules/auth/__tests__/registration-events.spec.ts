import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Regression coverage: player and seller registrations MUST publish a
 * `user:registered` domain event so the socket publisher can broadcast to the
 * Admin room and the frontend invalidates the Admin Users list without a
 * manual refresh (mirrors the organisation:created contract).
 */

const mockEmit = vi.fn();

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: async () => [{ insertId: 555 }, []],
    query: async () => [[], []],
  }),
}));
vi.mock('../infrastructure/repositories/user.repository.js', () => ({
  userRepository: {
    getCountryPhoneCode: vi.fn(async () => '+249'),
    findByPhone: vi.fn(async () => null),
    findByEmail: vi.fn(async () => null),
    create: vi.fn(async () => 4242),
    createPlayerProfile: vi.fn(async () => undefined),
    createWallet: vi.fn(async () => undefined),
    assignPlayerRole: vi.fn(async () => undefined),
    setSportInterestIds: vi.fn(async () => undefined),
    findById: vi.fn(async () => ({
      id: 4242, public_id: 'pub-1', full_name: 'Test User', email: 't@t.local',
      phone_number: '01', full_phone: '+24901', gender: 'male', birth_date: null,
      language_id: null, timezone: 'UTC', dark_mode: 'system', is_public: 1,
      main_sport_id: null, main_level_id: null,
    })),
    getSportInterestIds: vi.fn(async () => []),
    getEmergencyContacts: vi.fn(async () => []),
  },
}));
vi.mock('../infrastructure/repositories/session.repository.js', () => ({
  sessionRepository: {
    create: vi.fn(async () => undefined),
    countActiveForUser: vi.fn(async () => 0),
    revokeOldestForUser: vi.fn(async () => undefined),
  },
}));
vi.mock('../infrastructure/repositories/device.repository.js', () => ({
  DeviceRepository: class {
    findOrCreate = vi.fn(async () => 1);
  },
}));
vi.mock('../../rbac/infrastructure/repositories/rbac.repository.js', () => ({
  rbacRepository: {
    getUserPermissionKeys: vi.fn(async () => []),
    getTemplateRoleBySlug: vi.fn(async () => ({ id: 9 })),
    cloneRoleForOrg: vi.fn(async () => 91),
    assignRole: vi.fn(async () => 92),
    setUserRoleScope: vi.fn(async () => undefined),
  },
}));
vi.mock('../../payment/infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    getPlanPrice: vi.fn(async () => null),
    getUserDefaultCurrency: vi.fn(async () => 'USD'),
  },
}));
vi.mock('../../approvals/application/approval.service.js', () => ({
  approvalService: { approveRegistration: vi.fn(async () => undefined) },
}));
vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: vi.fn(async () => undefined) },
}));
vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBusV2: { emit: mockEmit, on: vi.fn() },
}));
vi.mock('../../audit-log/index.js', () => ({
  recordAudit: vi.fn(),
}));

describe('registration → user:registered realtime contract', () => {
  beforeEach(() => {
    mockEmit.mockClear();
  });

  it('player registration emits user:registered exactly once with userType=player (no duplicates)', async () => {
    const { authService } = await import('../application/auth.service.js');
    await authService.registerPlayer({
      countryId: 1,
      phoneNumber: '0123456789',
      fullName: 'New Player',
      email: 'p@t.local',
      password: 'secret123',
      gender: 'male',
      interestedSportIds: [21],
    } as any, { ip: '127.0.0.1' });

    const calls = mockEmit.mock.calls.filter(([name]) => name === 'user:registered');
    expect(calls).toHaveLength(1);
    const [, payload] = calls[0];
    expect(payload).toMatchObject({ userId: 4242, name: 'New Player', userType: 'player' });
  });

  it('seller registration emits user:registered exactly once with userType=seller (no duplicates)', async () => {
    const { authService } = await import('../application/auth.service.js');
    await authService.registerSeller({
      countryId: 1,
      phoneNumber: '0123456788',
      fullName: 'New Seller',
      email: 's@t.local',
      password: 'secret123',
      gender: 'female',
      shopName: 'Test Shop',
    } as any, { ip: '127.0.0.1' });

    const calls = mockEmit.mock.calls.filter(([name]) => name === 'user:registered');
    expect(calls).toHaveLength(1);
    const [, payload] = calls[0];
    expect(payload).toMatchObject({ userId: 4242, name: 'New Seller', userType: 'seller' });
  });
});
