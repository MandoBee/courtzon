import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test', REDIS_HOST: '127.0.0.1', REDIS_PORT: 6379, REDIS_DB: 0,
    DB_HOST: '127.0.0.1', DB_PORT: 3307, DB_USER: 'root', DB_PASSWORD: 'test', DB_NAME: 'courtzon_v3',
  },
}));

const { poolState } = vi.hoisted(() => ({
  poolState: { impl: vi.fn(async () => [[], []]) },
}));

vi.mock('../../database/mysql.js', () => ({
  getPool: () => ({ execute: poolState.impl }),
}));

const canAccessOrganisationMock = vi.fn();
const isPlatformAdminMock = vi.fn();
vi.mock('../../shared/middleware/org-access.js', () => ({
  canAccessOrganisation: (userId: number, orgId: number) => canAccessOrganisationMock(userId, orgId),
  isPlatformAdmin: (userId: number) => isPlatformAdminMock(userId),
}));

vi.mock('../../app.js', () => ({ ALLOWED_ORIGINS: [] }));
vi.mock('../../shared/event-bus/event-bus.v2.js', () => ({ eventBusV2: { emit: vi.fn() } }));
vi.mock('../../modules/notifications/application/presence.service.js', () => ({
  setOnlineWithReconnect: vi.fn(async () => []),
  setOffline: vi.fn(async () => {}),
}));
vi.mock('../../modules/notifications/application/cross-device-sync.service.js', () => ({
  registerUserDevice: vi.fn(async () => {}),
}));

import { canJoinRoom } from '../index.js';

const socket = (userId: number) => ({ data: { userId } });

function mockRows(rows: any[]) {
  poolState.impl = vi.fn(async () => [rows, []]);
}

describe('Socket room authorization — fails closed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAccessOrganisationMock.mockResolvedValue(false);
    isPlatformAdminMock.mockResolvedValue(false);
  });

  it('booking: owner may join', async () => {
    mockRows([{ user_id: 7, organisation_id: 10 }]);
    expect(await canJoinRoom(socket(7), 'booking', 55)).toBe(true);
  });

  it('booking: organisation staff may join (canAccessOrganisation)', async () => {
    mockRows([{ user_id: 7, organisation_id: 10 }]);
    canAccessOrganisationMock.mockResolvedValue(true);
    expect(await canJoinRoom(socket(99), 'booking', 55)).toBe(true);
    expect(canAccessOrganisationMock).toHaveBeenCalledWith(99, 10);
  });

  it('booking: unrelated user is rejected', async () => {
    mockRows([{ user_id: 7, organisation_id: 10 }]);
    expect(await canJoinRoom(socket(999), 'booking', 55)).toBe(false);
  });

  it('booking: nonexistent booking is rejected (no id alone grants access)', async () => {
    mockRows([]);
    expect(await canJoinRoom(socket(7), 'booking', 404040)).toBe(false);
  });

  it('resource: any authenticated user may join a valid resource', async () => {
    mockRows([{ id: 3 }]);
    expect(await canJoinRoom(socket(42), 'resource', 3)).toBe(true);
  });

  it('resource: nonexistent resource is rejected', async () => {
    mockRows([]);
    expect(await canJoinRoom(socket(42), 'resource', 999999)).toBe(false);
  });

  it('conversation: a participant may join', async () => {
    mockRows([{ ok: 1 }]);
    expect(await canJoinRoom(socket(7), 'conversation', 4)).toBe(true);
  });

  it('conversation: a non-participant is rejected', async () => {
    mockRows([]);
    expect(await canJoinRoom(socket(7), 'conversation', 4)).toBe(false);
  });

  it('conversation: platform admin may join', async () => {
    mockRows([]);
    isPlatformAdminMock.mockResolvedValue(true);
    expect(await canJoinRoom(socket(1), 'conversation', 4)).toBe(true);
  });

  it('match: the booking owner may join', async () => {
    mockRows([{ id: 9, owner_id: 7 }]);
    expect(await canJoinRoom(socket(7), 'match', 9)).toBe(true);
  });

  it('match: an invited user may join', async () => {
    poolState.impl = vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM matches')) return [[{ id: 9, owner_id: 7 }], []];
      if (String(sql).includes('FROM invitations')) return [[{ ok: 1 }], []];
      return [[], []];
    });
    expect(await canJoinRoom(socket(88), 'match', 9)).toBe(true);
  });

  it('match: an unrelated user is rejected (also not invited/requested, not admin)', async () => {
    poolState.impl = vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM matches')) return [[{ id: 9, owner_id: 7 }], []];
      if (String(sql).includes('FROM invitations')) return [[], []];
      if (String(sql).includes('FROM join_requests')) return [[], []];
      return [[], []];
    });
    expect(await canJoinRoom(socket(88), 'match', 9)).toBe(false);
  });

  it('match: platform admin may join', async () => {
    poolState.impl = vi.fn(async (sql: string) => {
      if (String(sql).includes('FROM matches')) return [[{ id: 9, owner_id: 7 }], []];
      return [[], []];
    });
    isPlatformAdminMock.mockResolvedValue(true);
    expect(await canJoinRoom(socket(1), 'match', 9)).toBe(true);
  });
});