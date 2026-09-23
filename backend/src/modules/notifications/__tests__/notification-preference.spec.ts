import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setFeatureFlag } from '../../../shared/utils/feature-flags.js';
import { categorizeEvent } from '../domain/notification-aggregate.js';

// G9-D5-C — the shared notification dispatcher honors the authoritative
// `user_notification_preferences.is_allowed` gate (no row = ENABLED; explicit
// OFF = suppressed; critical priority bypasses). v1 and v2 share the semantics.
setFeatureFlag('NOTIFICATION_V2_DISPATCH', false);

const __state = vi.hoisted(() => ({
  create: vi.fn(async () => 123),
  hasExisting: vi.fn(async () => false),
  isCategoryAllowed: vi.fn(async () => true),
  filterAllowedUserIds: vi.fn(async (ids: number[]) => ids),
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: vi.fn(async () => [[]]), query: vi.fn(async () => [[]]) }),
}));

vi.mock('../../../infrastructure/queue/queue.service.js', () => ({
  queueService: { add: vi.fn(async () => undefined) },
}));

vi.mock('../application/rate-limiter.service.js', () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  incrementRateLimit: vi.fn(async () => undefined),
}));

vi.mock('../application/digest.service.js', () => ({
  accumulateDigest: vi.fn(async () => false),
}));

vi.mock('../application/presence.service.js', () => ({
  isOnline: vi.fn(async () => true),
  queueForReconnect: vi.fn(async () => undefined),
}));

vi.mock('../application/template.service.js', () => ({
  getTemplate: vi.fn(async () => ({
    id: 10,
    eventName: 'tournament:withdrawal-resolved',
    locale: 'en',
    categorySlug: 'tournament',
    type: 'info',
    priority: 'normal',
    titleTemplate: 'Tournament Withdrawal',
    bodyTemplate: '{{recipientNotice}}',
    actionKey: 'view_tournament',
    routePattern: '/tournaments/{{tournamentId}}',
    imageUrl: null,
    actions: null,
    version: 1,
  })),
  resolveTemplate: vi.fn((_tpl, data) => ({
    title: 'Tournament Withdrawal',
    body: `tournament #${data.tournamentId}`,
  })),
}));

vi.mock('../infrastructure/repositories/notification.repository.js', () => ({
  notificationRepository: {
    create: __state.create,
    hasExisting: __state.hasExisting,
    isCategoryAllowed: __state.isCategoryAllowed,
    filterAllowedUserIds: __state.filterAllowedUserIds,
  },
}));

import { dispatchToUser, dispatchBulk } from '../application/dispatcher.service.js';
import { dispatchNotificationHandler } from '../commands/dispatch-notification.command.js';

const TOURNAMENT_OPTIONS = {
  eventName: 'tournament:withdrawal-resolved',
  categorySlug: 'tournament',
  data: { tournamentId: 1, withdrawnParticipantId: 5 },
};

function makeCommand(overrides: Record<string, any> = {}) {
  return {
    commandId: `cmd-${Date.now()}`,
    commandType: 'DispatchNotification',
    aggregateType: 'notification',
    aggregateId: '1',
    correlationId: 'ntf_x',
    payload: { userId: 1, ...TOURNAMENT_OPTIONS, ...overrides },
  };
}

const fakeConn = { execute: vi.fn(async () => [[]]) };

beforeEach(() => {
  vi.clearAllMocks();
  __state.create.mockResolvedValue(123);
  __state.hasExisting.mockResolvedValue(false);
  __state.isCategoryAllowed.mockResolvedValue(true);
  __state.filterAllowedUserIds.mockImplementation(async (ids: number[]) => ids);
});

describe('G9-D5-C — v1 dispatchToUser preference enforcement', () => {
  it('A/P. no explicit preference → notification is delivered (default ON)', async () => {
    __state.isCategoryAllowed.mockResolvedValue(true);
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS });
    expect(__state.isCategoryAllowed).toHaveBeenCalledWith(1, 'tournament');
    expect(__state.create).toHaveBeenCalledTimes(1);
  });

  it('B. explicit ON → notification is delivered', async () => {
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS });
    expect(__state.create).toHaveBeenCalledTimes(1);
  });

  it('C. explicit OFF → notification is suppressed (no row created)', async () => {
    __state.isCategoryAllowed.mockResolvedValue(false);
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS });
    expect(__state.create).not.toHaveBeenCalled();
  });

  it('D. user isolation — user A disabled, user B still receives', async () => {
    __state.isCategoryAllowed.mockImplementation(async (uid: number) => uid !== 1);
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS });
    await dispatchToUser({ userId: 2, ...TOURNAMENT_OPTIONS });
    expect(__state.create).toHaveBeenCalledTimes(1);
    expect(__state.create.mock.calls[0][0].userId).toBe(2);
  });

  it('critical priority bypasses the category preference', async () => {
    __state.isCategoryAllowed.mockResolvedValue(false);
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS, priority: 'critical' });
    expect(__state.create).toHaveBeenCalledTimes(1);
  });

  it('Q. suppression creates no fake row (dedup semantics preserved)', async () => {
    __state.isCategoryAllowed.mockResolvedValue(false);
    await dispatchToUser({ userId: 1, ...TOURNAMENT_OPTIONS });
    expect(__state.create).not.toHaveBeenCalled();
    // An opted-out user never gains a notification row, so hasExisting stays
    // false — replay still suppresses instead of double-sending.
    __state.isCategoryAllowed.mockResolvedValue(true);
    __state.hasExisting.mockResolvedValue(true);
    const { tournamentNotificationService } = await import('../application/tournament-notification.service.js');
    // (service-level dedup is exercised in the D5-B recipient spec; here we only
    // assert the dispatcher never fabricates a row on suppression)
  });
});

describe('G9-D5-C — v1 bulk preference enforcement', () => {
  it('E/F/I. bulk dispatch filters only opted-out recipients (pair/team/org-staff sets)', async () => {
    __state.filterAllowedUserIds.mockResolvedValue([1, 3]);
    await dispatchBulk([1, 2, 3], TOURNAMENT_OPTIONS);
    expect(__state.filterAllowedUserIds).toHaveBeenCalledWith([1, 2, 3], 'tournament');
    const createdUserIds = __state.create.mock.calls.map((c) => c[0].userId);
    expect(createdUserIds).toEqual([1, 3]);
  });

  it('bulk critical priority bypasses the preference filter', async () => {
    __state.filterAllowedUserIds.mockResolvedValue([]);
    await dispatchBulk([1, 2], { ...TOURNAMENT_OPTIONS, priority: 'critical' });
    expect(__state.create).toHaveBeenCalledTimes(2);
  });
});

describe('G9-D5-C — v2 command preference enforcement (identical semantics)', () => {
  it('N. v2 delivers when allowed', async () => {
    __state.isCategoryAllowed.mockResolvedValue(true);
    const res = await dispatchNotificationHandler.execute(makeCommand(), fakeConn);
    expect(__state.isCategoryAllowed).toHaveBeenCalledWith(1, 'tournament', fakeConn);
    expect(__state.create).toHaveBeenCalledTimes(1);
    expect(res.dispatched).toBe(true);
  });

  it('N. v2 suppresses when explicitly disabled', async () => {
    __state.isCategoryAllowed.mockResolvedValue(false);
    const res = await dispatchNotificationHandler.execute(makeCommand(), fakeConn);
    expect(__state.create).not.toHaveBeenCalled();
    expect(res.dispatched).toBe(false);
  });

  it('N. v2 critical priority bypasses the preference', async () => {
    __state.isCategoryAllowed.mockResolvedValue(false);
    const res = await dispatchNotificationHandler.execute(makeCommand({ priority: 'critical' }), fakeConn);
    expect(__state.create).toHaveBeenCalledTimes(1);
    expect(res.dispatched).toBe(true);
  });
});

describe('G9-D5-C — category routing / other categories / realtime', () => {
  it('M. booking/payment/marketplace/system category routing is unchanged', () => {
    expect(categorizeEvent('booking:created')).toBe('bookings');
    expect(categorizeEvent('payment:completed')).toBe('payments');
    expect(categorizeEvent('marketplace:order-placed')).toBe('marketplace');
    expect(categorizeEvent('user:registered')).toBe('system');
    expect(categorizeEvent('tournament:withdrawal-resolved')).toBe('tournament');
  });

  it('L. the preference gate lives in the SHARED dispatch layer, not realtime', () => {
    const dispatcherSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/notifications/application/dispatcher.service.ts'),
      'utf-8',
    );
    const commandSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/notifications/commands/dispatch-notification.command.ts'),
      'utf-8',
    );
    const socketSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/realtime/application/socket-publisher.ts'),
      'utf-8',
    );
    expect(dispatcherSource).toContain('isCategoryAllowed');
    expect(commandSource).toContain('isCategoryAllowed');
    // Realtime stays preference-free and still publishes tournament events.
    expect(socketSource).toContain("'tournament:withdrawal-resolved'");
    expect(socketSource).not.toContain('isCategoryAllowed');
    expect(socketSource).not.toContain('user_notification_preferences');
  });
});