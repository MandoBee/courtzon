import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

const mockExecute = vi.fn().mockResolvedValue([[{ affectedRows: 0 }], undefined]);

vi.mock('../../../modules/booking/infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: vi.fn(),
    persistTransition: vi.fn(),
    persistPaymentStatus: vi.fn(),
  },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({
    execute: mockExecute,
  }),
}));

import { bookingRepository } from '../../../modules/booking/infrastructure/repositories/booking.repository.js';
import { eventBus } from '../../../shared/event-bus/index.js';

const mockBooking = {
  id: 1,
  user_id: 42,
  organisation_id: 10,
  branch_id: 5,
  resource_id: 3,
  booking_status: 'pending',
  payment_status: 'pending',
  payment_method: 'card',
};

async function importSaga() {
  return import('../BookingSaga.js');
}

beforeEach(() => {
  vi.restoreAllMocks();
  (bookingRepository.findById as Mock).mockReset();
  (bookingRepository.persistTransition as Mock).mockReset();
  (bookingRepository.persistPaymentStatus as Mock).mockReset();
  (eventBus.emit as Mock).mockReset();
  mockExecute.mockReset();
  mockExecute.mockResolvedValue([[{ affectedRows: 0 }], undefined]);
});

describe('BookingSaga', () => {
  describe('confirmBooking', () => {
    it('confirms pending booking with paid status — emits booking:confirmed', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { confirmBooking } = await importSaga();

      const result = await confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' });

      expect(result.status).toBe('confirmed');
      expect(result.bookingId).toBe(1);
      expect(result.userId).toBe(42);
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'confirmed', 'paid', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:confirmed', expect.objectContaining({
        bookingId: 1, status: 'confirmed',
      }));
    });

    it('rejects confirm from non-pending status — no DB write, no event', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow();
      expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('cancels pending booking — emits booking:cancelled', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { cancelBooking } = await importSaga();

      const result = await cancelBooking(1, 99, 'User cancelled');

      expect(result.status).toBe('cancelled');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO booking_cancellations'),
        [1, 99, 'User cancelled', 0],
      );
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'cancelled', 'pending', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:cancelled', expect.objectContaining({
        bookingId: 1, status: 'cancelled',
      }));
    });

    it('rejects cancel from terminal status — no DB write, no event', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'completed' });
      const { cancelBooking } = await importSaga();

      await expect(cancelBooking(1, 99, 'Test')).rejects.toThrow();
      expect(bookingRepository.persistTransition).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('expireBooking', () => {
    it('expires pending booking — emits booking:expired', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { expireBooking } = await importSaga();

      const result = await expireBooking(1);

      expect(result.status).toBe('expired');
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'expired', 'expired', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:expired', expect.objectContaining({
        bookingId: 1, status: 'expired',
      }));
    });
  });

  describe('checkInBooking', () => {
    it('checks in confirmed booking — emits booking:check-in', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { checkInBooking } = await importSaga();

      const result = await checkInBooking(1);

      expect(result.status).toBe('checked_in');
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'checked_in', undefined, undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:check-in', expect.objectContaining({
        bookingId: 1, status: 'checked_in',
      }));
    });
  });

  describe('noShowBooking', () => {
    it('marks no-show on confirmed unpaid booking', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed', payment_status: 'pending' });
      const { noShowBooking } = await importSaga();

      const result = await noShowBooking(1, 99, 'No show');

      expect(result.status).toBe('no_show');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO booking_cancellations'),
        [1, 99, 'No show', 0],
      );
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'no_show', 'pending', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:no-show', expect.objectContaining({
        bookingId: 1, status: 'no_show',
      }));
    });
  });

  describe('completeBooking', () => {
    it('completes confirmed booking — emits booking:completed', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { completeBooking } = await importSaga();

      const result = await completeBooking(1);

      expect(result.status).toBe('completed');
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'completed', undefined, undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:completed', expect.objectContaining({
        bookingId: 1, status: 'completed',
      }));
    });
  });

  describe('cancelWithFeeBooking', () => {
    it('cancels confirmed booking with fee — emits booking:cancelled', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { cancelWithFeeBooking } = await importSaga();

      const result = await cancelWithFeeBooking(1, 99, 'Late cancellation', 50);

      expect(result.status).toBe('cancelled_with_fee');
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO booking_cancellations'),
        [1, 99, 'Late cancellation', 50],
      );
      expect(bookingRepository.persistTransition).toHaveBeenCalledWith(1, 'cancelled_with_fee', 'partially_refunded', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:cancelled', expect.objectContaining({
        bookingId: 1, status: 'cancelled_with_fee',
      }));
    });
  });

  describe('event payload consistency', () => {
    it('all emitted events share the same base shape', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { confirmBooking, expireBooking } = await importSaga();

      await confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' });
      const confirmPayload = (eventBus.emit as Mock).mock.calls[0][1];

      vi.clearAllMocks();
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      await expireBooking(1);
      const expirePayload = (eventBus.emit as Mock).mock.calls[0][1];

      expect(confirmPayload).toHaveProperty('bookingId');
      expect(confirmPayload).toHaveProperty('userId');
      expect(confirmPayload).toHaveProperty('organisationId');
      expect(confirmPayload).toHaveProperty('branchId');
      expect(confirmPayload).toHaveProperty('courtId');
      expect(confirmPayload).toHaveProperty('status');
      expect(confirmPayload).toHaveProperty('timestamp');
      expect(expirePayload).toHaveProperty('bookingId');
      expect(expirePayload).toHaveProperty('status');
    });
  });

  describe('repository failure — no event emitted', () => {
    it('does not emit event when repository throws', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      (bookingRepository.persistTransition as Mock).mockRejectedValue(new Error('DB error'));
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow('DB error');
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking releases slots', () => {
    it('sets booking_slots is_available = TRUE on cancel', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { cancelBooking } = await importSaga();

      await cancelBooking(1, 99, 'User cancelled');

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ? AND is_available = FALSE',
        [1],
      );
    });
  });

  describe('expireBooking releases slots', () => {
    it('sets booking_slots is_available = TRUE on expire', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { expireBooking } = await importSaga();

      await expireBooking(1);

      expect(mockExecute).toHaveBeenCalledWith(
        'UPDATE booking_slots SET is_available = TRUE WHERE booking_id = ? AND is_available = FALSE',
        [1],
      );
    });
  });
});
