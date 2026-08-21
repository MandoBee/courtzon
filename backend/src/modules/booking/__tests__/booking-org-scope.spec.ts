import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../database/mysql.js', () => ({ getPool: vi.fn() }));
vi.mock('../../../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    REDIS_HOST: '127.0.0.1',
    REDIS_PORT: 6379,
    REDIS_DB: 0,
    DB_HOST: '127.0.0.1',
    DB_PORT: 3306,
    DB_USER: 'root',
    DB_PASSWORD: 'test',
    DB_NAME: 'courtzon_test',
  },
}));
vi.mock('../../../infrastructure/redis/redis.client.js', () => ({
  getRedisClient: vi.fn(() => ({
    get: vi.fn(), set: vi.fn(), del: vi.fn(), incr: vi.fn(), expire: vi.fn(),
    on: vi.fn(), quit: vi.fn(),
  })),
  closeRedisClient: vi.fn(),
}));
vi.mock('../infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: vi.fn(),
    canAccessOrganisation: vi.fn(),
  },
}));

import { BookingService } from '../application/booking.service.js';
import { bookingRepository } from '../infrastructure/repositories/booking.repository.js';

const service = new BookingService();

beforeEach(() => {
  vi.clearAllMocks();
});

describe('BookingService._assertCanManageBooking (A3 org scoping)', () => {
  const booking = { id: 9, organisation_id: 77 };

  it('denies when no actor id is supplied', async () => {
    await expect(service._assertCanManageBooking(9, undefined)).rejects.toThrow('Booking not found');
  });

  it('denies when the booking does not exist', async () => {
    (bookingRepository.findById as any).mockResolvedValue(null);
    await expect(service._assertCanManageBooking(9, 1)).rejects.toThrow('Booking not found');
  });

  it('denies when the actor has no access to the booking organisation (non-revealing 404)', async () => {
    (bookingRepository.findById as any).mockResolvedValue(booking);
    (bookingRepository.canAccessOrganisation as any).mockResolvedValue(false);
    await expect(service._assertCanManageBooking(9, 1)).rejects.toThrow('Booking not found');
  });

  it('allows when the actor has access to the booking organisation', async () => {
    (bookingRepository.findById as any).mockResolvedValue(booking);
    (bookingRepository.canAccessOrganisation as any).mockResolvedValue(true);
    await expect(service._assertCanManageBooking(9, 1)).resolves.toBeUndefined();
    expect(bookingRepository.canAccessOrganisation).toHaveBeenCalledWith(1, 77);
  });
});