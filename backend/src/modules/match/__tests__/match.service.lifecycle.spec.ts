import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const session = vi.hoisted(() => ({ start: vi.fn(), complete: vi.fn() }));
const publisher = vi.hoisted(() => ({ publish: vi.fn() }));
const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findScheduledMatchesPastEnd: vi.fn(),
  findActiveSessionForMatch: vi.fn(),
  completeMatchSessionAtScheduledEnd: vi.fn(),
  createCompletedSessionForMatch: vi.fn(),
  markMatchCompleted: vi.fn(),
}));
const matchmaking = vi.hoisted(() => ({ sendInvitations: vi.fn() }));
const invitations = vi.hoisted(() => ({ expireByMatchId: vi.fn(), autoRejectPendingByMatchId: vi.fn() }));
const joinRequests = vi.hoisted(() => ({ autoRejectPendingByMatchId: vi.fn() }));

const poolExecute = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute: poolExecute, getConnection: async () => ({}) }),
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

const candidateRow = { id: 42, status: 'closed', startAtUtc: '2026-07-10 08:00:00', endAtUtc: '2026-07-10 10:00:00' };

describe('MatchService lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('startMatch / completeMatch', () => {
    it('delegates to the existing sessionService (no parallel mechanism)', async () => {
      await matchService.startMatch(42);
      expect(session.start).toHaveBeenCalledWith(42);

      await matchService.completeMatch(42);
      expect(session.complete).toHaveBeenCalledWith(42);
    });
  });

  describe('autoCompleteScheduledMatches', () => {
    it('creates a completed session for a never-started closed match whose scheduled end passed', async () => {
      repo.findScheduledMatchesPastEnd.mockResolvedValue([candidateRow]);
      repo.findActiveSessionForMatch.mockResolvedValue(null);

      const completed = await matchService.autoCompleteScheduledMatches();
      expect(completed).toBe(1);
      expect(repo.createCompletedSessionForMatch).toHaveBeenCalledWith(42, '2026-07-10 08:00:00', '2026-07-10 10:00:00');
      expect(repo.markMatchCompleted).toHaveBeenCalledWith(42);
      expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:status_changed', payload: expect.objectContaining({ matchId: 42, fromStatus: 'closed', toStatus: 'completed' }) }));
      expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:completed', payload: expect.objectContaining({ matchId: 42 }) }));
    });

    it('completes an in-progress session with the authoritative end_at_utc', async () => {
      repo.findScheduledMatchesPastEnd.mockResolvedValue([{ ...candidateRow, status: 'in_progress' }]);
      repo.findActiveSessionForMatch.mockResolvedValue({ id: 7, status: 'in_progress' });

      const completed = await matchService.autoCompleteScheduledMatches();
      expect(completed).toBe(1);
      expect(repo.completeMatchSessionAtScheduledEnd).toHaveBeenCalledWith(42, 7, '2026-07-10 08:00:00', '2026-07-10 10:00:00');
      expect(repo.markMatchCompleted).toHaveBeenCalledWith(42);
      expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'match:status_changed', payload: expect.objectContaining({ fromStatus: 'in_progress' }) }));
    });

    it('skips matches with an already-terminal session and tolerates per-row failures', async () => {
      repo.findScheduledMatchesPastEnd.mockResolvedValue([
        { ...candidateRow, id: 1 },
        { ...candidateRow, id: 2 },
      ]);
      // Match 1 already has a terminal session → skipped. Match 2 has none → completed.
      repo.findActiveSessionForMatch.mockImplementation(async (id: number) => (id === 1 ? { id: 5, status: 'completed' } : null));

      const completed = await matchService.autoCompleteScheduledMatches();
      expect(completed).toBe(1);
      expect(repo.createCompletedSessionForMatch).toHaveBeenCalledWith(2, expect.any(String), expect.any(String));
      expect(repo.createCompletedSessionForMatch).not.toHaveBeenCalledWith(1, expect.anything(), expect.anything());
    });
  });
});