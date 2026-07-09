import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../modules/booking/infrastructure/repositories/booking.repository.js', () => ({
  bookingRepository: {
    findById: vi.fn(),
    updateBookingStatus: vi.fn(),
    updateStatus: vi.fn(),
    cancelWithRefund: vi.fn(),
    checkIn: vi.fn(),
    markNoShow: vi.fn(),
    markNoShowWithRefund: vi.fn(),
  },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
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
  vi.clearAllMocks();
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
      expect(bookingRepository.updateBookingStatus).toHaveBeenCalledWith(1, 'confirmed', 'paid', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:confirmed', expect.objectContaining({
        bookingId: 1, status: 'confirmed',
      }));
    });

    it('rejects confirm from non-pending status — no DB write, no event', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow();
      expect(bookingRepository.updateBookingStatus).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('cancels pending booking — emits booking:cancelled', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { cancelBooking } = await importSaga();

      const result = await cancelBooking(1, 99, 'User cancelled');

      expect(result.status).toBe('cancelled');
      expect(bookingRepository.cancelWithRefund).toHaveBeenCalledWith(1, 99, 'User cancelled', 0, 'pending', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('booking:cancelled', expect.objectContaining({
        bookingId: 1, status: 'cancelled',
      }));
    });

    it('rejects cancel from terminal status — no DB write, no event', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue({ ...mockBooking, booking_status: 'completed' });
      const { cancelBooking } = await importSaga();

      await expect(cancelBooking(1, 99, 'Test')).rejects.toThrow();
      expect(bookingRepository.cancelWithRefund).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('expireBooking', () => {
    it('expires pending booking — emits booking:expired', async () => {
      (bookingRepository.findById as Mock).mockResolvedValue(mockBooking);
      const { expireBooking } = await importSaga();

      const result = await expireBooking(1);

      expect(result.status).toBe('expired');
      expect(bookingRepository.updateBookingStatus).toHaveBeenCalledWith(1, 'expired', 'expired', undefined);
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
      expect(bookingRepository.checkIn).toHaveBeenCalledWith(1, undefined);
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
      expect(bookingRepository.markNoShow).toHaveBeenCalledWith(1, undefined);
      expect(bookingRepository.markNoShowWithRefund).not.toHaveBeenCalled();
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
      expect(bookingRepository.updateStatus).toHaveBeenCalledWith(1, 'completed', undefined);
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
      expect(bookingRepository.cancelWithRefund).toHaveBeenCalledWith(1, 99, 'Late cancellation', 50, 'partially_refunded', undefined);
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
      (bookingRepository.updateBookingStatus as Mock).mockRejectedValue(new Error('DB error'));
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow('DB error');
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
