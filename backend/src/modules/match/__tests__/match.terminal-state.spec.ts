import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Match } from '../domain/match.entity.js';
import type { MatchStatus } from '../domain/match.types.js';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const conn = vi.hoisted(() => ({
  beginTransaction: vi.fn(),
  execute: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));
const publisher = vi.hoisted(() => ({ publish: vi.fn() }));
const repo = vi.hoisted(() => ({ findById: vi.fn() }));
const invitations = vi.hoisted(() => ({ expireByMatchId: vi.fn(), autoRejectPendingByMatchId: vi.fn() }));
const joinRequests = vi.hoisted(() => ({ autoRejectPendingByMatchId: vi.fn() }));
const session = vi.hoisted(() => ({ start: vi.fn(), complete: vi.fn() }));
const matchmaking = vi.hoisted(() => ({ sendInvitations: vi.fn() }));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ getConnection: async () => conn }),
}));
vi.mock('../application/events/match-event-publisher.js', () => ({ matchEventPublisher: publisher }));
vi.mock('../infrastructure/repositories/match.repository.js', () => ({ matchRepository: repo }));
vi.mock('../application/services/matchmaking.service.js', () => ({ matchmakingService: matchmaking }));
vi.mock('../application/services/invitation.service.js', () => ({ invitationService: invitations }));
vi.mock('../application/services/join-request.service.js', () => ({ joinRequestService: joinRequests }));
vi.mock('../application/services/participant.service.js', () => ({ participantService: {} }));
vi.mock('../application/services/waiting-list.service.js', () => ({ waitingListService: {} }));
vi.mock('../application/services/session.service.js', () => ({ sessionService: session }));

import { matchService } from '../application/services/match.service.js';

function terminalMatch(id: number, status: MatchStatus): Match {
  return new Match({
    id,
    type: 'public',
    status,
    bookingId: 9901,
    sportId: 1,
    version: 1,
    createdAt: new Date('2026-08-01T08:00:00Z'),
    updatedAt: new Date('2026-08-01T09:00:00Z'),
  });
}

describe('MatchService terminal-state guard (UAT: completed match must not expose active actions)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cancelMatch', () => {
    it.each<MatchStatus>(['completed', 'cancelled', 'void'])(
      'rejects cancelling a %s match with 409 INVALID_MATCH_STATUS and performs no side effects',
      async (status) => {
        repo.findById.mockResolvedValue(terminalMatch(77, status));

        await expect(matchService.cancelMatch(77)).rejects.toMatchObject({
          statusCode: 409,
          errorCode: 'INVALID_MATCH_STATUS',
        });

        expect(conn.execute).not.toHaveBeenCalled();
        expect(invitations.expireByMatchId).not.toHaveBeenCalled();
        expect(joinRequests.autoRejectPendingByMatchId).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
      },
    );

    it('still allows cancelling an open match and publishes match:cancelled', async () => {
      repo.findById.mockResolvedValue(terminalMatch(78, 'open'));

      await expect(matchService.cancelMatch(78)).resolves.toBeUndefined();
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('cancelled'),
        [78],
      );
      expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:cancelled' }), expect.anything());
    });
  });

  describe('closeMatch', () => {
    it.each<MatchStatus>(['completed', 'cancelled', 'void'])(
      'rejects closing a %s match with 409 INVALID_MATCH_STATUS and performs no side effects',
      async (status) => {
        repo.findById.mockResolvedValue(terminalMatch(79, status));

        await expect(matchService.closeMatch(79)).rejects.toMatchObject({
          statusCode: 409,
          errorCode: 'INVALID_MATCH_STATUS',
        });

        expect(conn.execute).not.toHaveBeenCalled();
        expect(invitations.expireByMatchId).not.toHaveBeenCalled();
        expect(publisher.publish).not.toHaveBeenCalled();
      },
    );

    it('still allows closing an open match and publishes match:status_changed', async () => {
      repo.findById.mockResolvedValue(terminalMatch(80, 'open'));

      await expect(matchService.closeMatch(80)).resolves.toBeUndefined();
      expect(conn.execute).toHaveBeenCalledWith(
        expect.stringContaining('closed'),
        [80],
      );
      expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:status_changed' }), expect.anything());
    });
  });
});