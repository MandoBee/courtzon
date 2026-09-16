import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DB_HOST = '127.0.0.1'; process.env.DB_PORT = '3307';
  process.env.DB_USER = 'root'; process.env.DB_PASSWORD = 'courtzon2026'; process.env.DB_NAME = 'courtzon_v3';
  process.env.REDIS_HOST = '127.0.0.1'; process.env.REDIS_PORT = '6379'; process.env.PORT = '3001';
});

const repo = vi.hoisted(() => ({
  findById: vi.fn(),
  createMatchmakingRequest: vi.fn(),
  findMatchingPlayers: vi.fn(),
  createInvitation: vi.fn(),
}));
const pool = vi.hoisted(() => ({
  execute: vi.fn(async (sql: string) => {
    if (String(sql).includes('SELECT sport_id FROM resources')) return [[{ sport_id: 22 }]];
    return [[]];
  }),
}));

vi.mock('../../../database/mysql.js', () => ({ getPool: () => pool }));
vi.mock('../infrastructure/repositories/booking.repository.js', () => ({ bookingRepository: repo }));
vi.mock('../../sports/infrastructure/repositories/sports.repository.js', () => ({ sportsRepository: {} }));
vi.mock('../infrastructure/repositories/booking-invitation.repository.js', () => ({ bookingInvitationRepository: {} }));
vi.mock('../../../../shared/event-bus/index.js', () => ({ eventBusV2: { emit: vi.fn() } }));

import { bookingService } from '../application/booking.service.js';
import { ConflictError } from '../../../shared/errors/app-error.js';

describe('Matchmaking deadline validation — authoritative start_at_utc', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.findById.mockResolvedValue(null);
  });

  it('accepts a deadline strictly before the authoritative start_at_utc', async () => {
    // Booking starts 2026-09-15 00:00 Africa/Cairo = 2026-09-14T21:00:00.000Z
    // A deadline of 2026-09-14T20:00:00Z is before it → valid.
    repo.findById.mockResolvedValue({
      id: 10, user_id: 42, booking_status: 'confirmed',
      booking_date: '2026-09-15', start_time: '00:00',
      start_at_utc: '2026-09-14 21:00:00',
      resource_id: 7, booking_type: 'public_match',
    });
    repo.findMatchingPlayers.mockResolvedValue([]);

    await expect(bookingService.startMatchmaking(10, 42, {
      deadline: '2026-09-14T20:00:00.000Z', maxPlayers: 2, targetGender: 'any',
    })).resolves.not.toThrow();
    expect(repo.createMatchmakingRequest).toHaveBeenCalledWith(expect.objectContaining({
      deadline: '2026-09-14T20:00:00.000Z',
    }));
  });

  it('rejects a deadline equal to the actual booking start instant', async () => {
    repo.findById.mockResolvedValue({
      id: 11, user_id: 42, booking_status: 'confirmed',
      booking_date: '2026-09-15', start_time: '00:00',
      start_at_utc: '2026-09-14 21:00:00',
      resource_id: 7, booking_type: 'public_match',
    });

    await expect(bookingService.startMatchmaking(11, 42, {
      deadline: '2026-09-14T21:00:00.000Z', maxPlayers: 2, targetGender: 'any',
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('rejects a deadline AFTER the actual booking start instant (same local date, later time)', async () => {
    repo.findById.mockResolvedValue({
      id: 12, user_id: 42, booking_status: 'confirmed',
      booking_date: '2026-09-15', start_time: '00:00',
      start_at_utc: '2026-09-14 21:00:00',
      resource_id: 7, booking_type: 'public_match',
    });

    // 23:59 on 15/09 local is AFTER the actual start instant (14/09 21:00Z).
    await expect(bookingService.startMatchmaking(12, 42, {
      deadline: '2026-09-15T20:59:00.000Z', maxPlayers: 2, targetGender: 'any',
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('cross-timezone: a deadline before the start in branch time is still validated on the same instant', async () => {
    repo.findById.mockResolvedValue({
      id: 13, user_id: 42, booking_status: 'confirmed',
      booking_date: '2026-09-15', start_time: '12:00',
      start_at_utc: '2026-09-15 09:00:00', // 12:00 Cairo = 09:00Z
      resource_id: 7, booking_type: 'public_match',
    });

    // 11:00 local (before 12:00) → 08:00Z, valid.
    await expect(bookingService.startMatchmaking(13, 42, {
      deadline: '2026-09-15T08:00:00.000Z', maxPlayers: 2, targetGender: 'any',
    })).resolves.not.toThrow();

    // 12:00 local (== start) → 09:00Z, invalid.
    await expect(bookingService.startMatchmaking(13, 42, {
      deadline: '2026-09-15T09:00:00.000Z', maxPlayers: 2, targetGender: 'any',
    })).rejects.toBeInstanceOf(ConflictError);
  });

  it('accepts an absent/null deadline (optional field) without generating one', async () => {
    repo.findById.mockResolvedValue({
      id: 14, user_id: 42, booking_status: 'confirmed',
      booking_date: '2026-09-15', start_time: '00:00',
      start_at_utc: '2026-09-14 21:00:00',
      resource_id: 7, booking_type: 'public_match',
    });
    repo.findMatchingPlayers.mockResolvedValue([]);

    await expect(bookingService.startMatchmaking(14, 42, {
      maxPlayers: 2, targetGender: 'any',
    })).resolves.not.toThrow();
    expect(repo.createMatchmakingRequest).toHaveBeenCalledWith(expect.objectContaining({
      deadline: undefined,
    }));
  });
});