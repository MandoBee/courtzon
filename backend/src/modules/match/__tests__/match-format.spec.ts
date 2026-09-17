import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const publisher = vi.hoisted(() => ({ publish: vi.fn() }));
const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  findScheduledMatchesPastEnd: vi.fn(),
  findClosedMatchesPastStart: vi.fn(),
  findActiveSessionForMatch: vi.fn(),
  completeMatchSessionAtScheduledEnd: vi.fn(),
  createCompletedSessionForMatch: vi.fn(),
  markMatchCompleted: vi.fn(),
}));
const matchmaking = vi.hoisted(() => ({ sendInvitations: vi.fn() }));
const invitations = vi.hoisted(() => ({ expireByMatchId: vi.fn(), autoRejectPendingByMatchId: vi.fn() }));
const joinRequests = vi.hoisted(() => ({ autoRejectPendingByMatchId: vi.fn() }));
const formatRepo = vi.hoisted(() => ({
  resolveDefaultFormatForSport: vi.fn(),
  findFormatById: vi.fn(),
}));

const poolExecute = vi.hoisted(() => vi.fn());
const poolGetConnection = vi.hoisted(() => vi.fn());

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: poolExecute,
    getConnection: poolGetConnection,
  }),
}));
vi.mock('../application/events/match-event-publisher.js', () => ({ matchEventPublisher: publisher }));
vi.mock('../infrastructure/repositories/match.repository.js', () => ({ matchRepository: repo }));
vi.mock('../application/services/matchmaking.service.js', () => ({ matchmakingService: matchmaking }));
vi.mock('../application/services/invitation.service.js', () => ({ invitationService: invitations }));
vi.mock('../application/services/join-request.service.js', () => ({ joinRequestService: joinRequests }));
vi.mock('../application/services/participant.service.js', () => ({ participantService: {} }));
vi.mock('../application/services/waiting-list.service.js', () => ({ waitingListService: {} }));
vi.mock('../application/services/session.service.js', () => ({ sessionService: {} }));
vi.mock('../../../modules/match-result/infrastructure/match-result.repository.js', () => ({ matchResultRepository: formatRepo }));

import { matchService } from '../application/services/match.service.js';
import { Match } from '../domain/match.entity.js';

const bookingRows = [{ id: 500, user_id: 7, resource_id: 9, sport_id: 22, booking_date: '2026-09-20', start_time: '10:00:00', end_time: '12:00:00' }];

function fakeConn() {
  return {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    execute: vi.fn(async (sql: string) => {
      if (sql.includes('INSERT INTO matches')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO public_match_details')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO match_participants')) return [{ insertId: 1 }, []];
      if (sql.includes('FROM booking_matchmaking_requests')) return [[]];
      return [[], []];
    }),
  };
}

async function createdConn(): Promise<ReturnType<typeof fakeConn>> {
  return (await poolGetConnection.mock.results[0].value) as ReturnType<typeof fakeConn>;
}

beforeEach(() => {
  vi.clearAllMocks();
  matchmaking.sendInvitations.mockResolvedValue(undefined);
  poolGetConnection.mockReturnValue(Promise.resolve(fakeConn()));
  repo.findById.mockResolvedValue(new Match({
    id: 1, type: 'public', status: 'open', bookingId: 500, sportId: 22,
    formatId: 1, formatSnapshot: { formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' },
    version: 1, createdAt: new Date(), updatedAt: new Date(),
  }));
});

describe('Group 1 — Match Format Foundation', () => {
  it('resolves the default format and persists format_id + snapshot at match creation', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      if (sql.includes('INSERT INTO matches')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO public_match_details')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO match_participants')) return [{ insertId: 1 }, []];
      if (sql.includes('FROM booking_matchmaking_requests')) return [[]];
      return [[], []];
    });
    formatRepo.resolveDefaultFormatForSport.mockResolvedValue({ formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' });

    const match = await matchService.createFromBooking(500, 'public_match');

    expect(match).not.toBeNull();
    const conn = await createdConn();
    const insertSql = conn.execute.mock.calls.map((c: any[]) => c[0]).find((s: string) => s.includes('INSERT INTO matches'));
    expect(insertSql).toContain('format_id');
    expect(insertSql).toContain('format_snapshot');
    const insertParams = conn.execute.mock.calls.find((c: any[]) => c[0].includes('INSERT INTO matches'))[1];
    expect(insertParams[2]).toBe(1); // format_id
    expect(JSON.parse(insertParams[3])).toEqual({ formatId: 1, formatType: 'doubles', playersPerSide: 2, name: 'Padel Standard' });
    expect(publisher.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'match:created',
      payload: expect.objectContaining({ formatId: 1 }),
    }));
  });

  it('preserves current behaviour when a sport has no configured format (format stays null)', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      if (sql.includes('INSERT INTO matches')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO public_match_details')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO match_participants')) return [{ insertId: 1 }, []];
      if (sql.includes('FROM booking_matchmaking_requests')) return [[]];
      return [[], []];
    });
    formatRepo.resolveDefaultFormatForSport.mockResolvedValue(null);
    repo.findById.mockResolvedValue(new Match({
      id: 1, type: 'public', status: 'open', bookingId: 500, sportId: 22,
      formatId: null, formatSnapshot: null,
      version: 1, createdAt: new Date(), updatedAt: new Date(),
    }));

    const match = await matchService.createFromBooking(500, 'public_match');
    expect(match).not.toBeNull();
    expect(match.formatId).toBeNull();
    const conn = await createdConn();
    const insertParams = conn.execute.mock.calls.find((c: any[]) => c[0].includes('INSERT INTO matches'))[1];
    expect(insertParams[2]).toBeNull();
    expect(insertParams[3]).toBeNull();
  });

  it('accepts an explicit format_id and validates sport compatibility', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      if (sql.includes('INSERT INTO matches')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO public_match_details')) return [{ insertId: 1 }, []];
      if (sql.includes('INSERT INTO match_participants')) return [{ insertId: 1 }, []];
      if (sql.includes('FROM booking_matchmaking_requests')) return [[]];
      return [[], []];
    });
    formatRepo.findFormatById.mockResolvedValue({ formatId: 7, sportId: 22, formatType: 'doubles', playersPerSide: 2, name: 'Padel Doubles', isActive: true });

    const match = await matchService.createFromBooking(500, 'public_match', 7);
    expect(match).not.toBeNull();
    const conn = await createdConn();
    const insertParams = conn.execute.mock.calls.find((c: any[]) => c[0].includes('INSERT INTO matches'))[1];
    expect(insertParams[2]).toBe(7);
  });

  it('rejects an explicit format that does not belong to the Match sport', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      return [[], []];
    });
    // Tennis Singles (sport 21) passed for a Padel match (sport 22) → mismatch
    formatRepo.findFormatById.mockResolvedValue({ formatId: 2, sportId: 21, formatType: 'singles', playersPerSide: 1, name: 'Tennis Standard', isActive: true });

    await expect(matchService.createFromBooking(500, 'public_match', 2)).rejects.toThrow('does not belong to the Match sport');
  });

  it('rejects an inactive format', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      return [[], []];
    });
    formatRepo.findFormatById.mockResolvedValue({ formatId: 9, sportId: 22, formatType: 'team', playersPerSide: null, name: 'Archived', isActive: false });

    await expect(matchService.createFromBooking(500, 'public_match', 9)).rejects.toThrow('is not active');
  });

  it('rejects an unknown format', async () => {
    poolExecute.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT id FROM matches WHERE booking_id')) return [[]];
      if (sql.includes('FROM bookings b')) return [bookingRows];
      return [[], []];
    });
    formatRepo.findFormatById.mockResolvedValue(null);

    await expect(matchService.createFromBooking(500, 'public_match', 999)).rejects.toThrow('format not found');
  });

  it('uses the format-snapshot getter exposed by the domain entity', () => {
    const m = new Match({
      id: 3, type: 'public', status: 'open', bookingId: 3, sportId: 21,
      formatId: 2, formatSnapshot: { formatId: 2, formatType: 'singles', playersPerSide: 1, name: 'Tennis Standard' },
      version: 1, createdAt: new Date(), updatedAt: new Date(),
    });
    expect(m.formatId).toBe(2);
    expect(m.formatSnapshot?.formatType).toBe('singles');
    expect(m.formatSnapshot?.playersPerSide).toBe(1);
  });
});