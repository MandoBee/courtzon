import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Match } from '../domain/match.entity.js';

const repo = vi.hoisted(() => ({ findById: vi.fn() }));
const publisher = vi.hoisted(() => ({ publish: vi.fn() }));
const connMock = vi.hoisted(() => ({
  beginTransaction: vi.fn(async () => undefined),
  commit: vi.fn(async () => undefined),
  rollback: vi.fn(async () => undefined),
  release: vi.fn(() => undefined),
  execute: vi.fn(async () => [{}]),
  query: vi.fn(async () => [[]]),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ getConnection: async () => connMock }) }));
vi.mock('../application/events/match-event-publisher.js', () => ({ matchEventPublisher: publisher }));
vi.mock('../infrastructure/repositories/match.repository.js', () => ({ matchRepository: repo }));
vi.mock('../application/services/matchmaking.service.js', () => ({ matchmakingService: { sendInvitations: vi.fn() } }));
vi.mock('../application/services/invitation.service.js', () => ({ invitationService: { expireByMatchId: vi.fn(), autoRejectPendingByMatchId: vi.fn() } }));
vi.mock('../application/services/join-request.service.js', () => ({ joinRequestService: { autoRejectPendingByMatchId: vi.fn() } }));
vi.mock('../application/services/participant.service.js', () => ({ participantService: {} }));
vi.mock('../application/services/waiting-list.service.js', () => ({ waitingListService: {} }));

import { matchService } from '../application/services/match.service.js';

function makeMatch(status: string): Match {
  return new Match({
    id: 900, type: 'public', status: status as any, bookingId: null, sportId: 22,
    formatId: 1, formatSnapshot: null, ruleSetId: 1, ruleSnapshot: null,
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  });
}

describe('cancelTournamentMatch (G9-D2 — non-destructive cancellation)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels an unstarted (closed) match and PRESERVES match_participants (roster/history)', async () => {
    repo.findById.mockResolvedValue(makeMatch('closed'));

    await matchService.cancelTournamentMatch(900, 'participant withdrew after start');

    const updates = connMock.execute.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE matches'));
    expect(updates).toHaveLength(1);
    expect(String(updates[0][0])).toContain("status = 'cancelled'");
    // NON-DESTRUCTIVE: no DELETE on match_participants / waiting_list is issued.
    expect(connMock.execute.mock.calls.every((c: any[]) => !String(c[0]).includes('DELETE FROM'))).toBe(true);
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'match:cancelled',
      payload: expect.objectContaining({ matchId: 900, reason: 'participant withdrew after start' }),
    }));
  });

  it('never cancels an in_progress match (M5 — withdrawal must not stop a live match)', async () => {
    repo.findById.mockResolvedValue(makeMatch('in_progress'));

    await matchService.cancelTournamentMatch(900);

    expect(connMock.execute.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE matches'))).toHaveLength(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('never cancels a completed match (M5 — historical state immutable)', async () => {
    repo.findById.mockResolvedValue(makeMatch('completed'));

    await matchService.cancelTournamentMatch(900);

    expect(connMock.execute.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE matches'))).toHaveLength(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('is idempotent for an already-cancelled match (no duplicate event)', async () => {
    repo.findById.mockResolvedValue(makeMatch('cancelled'));

    await matchService.cancelTournamentMatch(900);

    expect(connMock.execute.mock.calls.filter((c: any[]) => String(c[0]).includes('UPDATE matches'))).toHaveLength(0);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});