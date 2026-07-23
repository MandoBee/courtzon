import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn(), on: vi.fn(), subscribe: vi.fn() },
  eventBusV2: { emit: vi.fn(), subscribe: vi.fn(), on: vi.fn() },
}));

const mockRepo = {
  findById: vi.fn(),
  persistTransition: vi.fn(),
  persistPaymentStatus: vi.fn(),
  releaseSlots: vi.fn(),
  lockSlots: vi.fn(),
  createCancellation: vi.fn(),
};

import { eventBusV2 } from '../../../shared/event-bus/index.js';
import { initBooking } from '../BookingSaga.js';

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

beforeEach(async () => {
  vi.restoreAllMocks();
  mockRepo.findById.mockReset();
  mockRepo.persistTransition.mockReset();
  mockRepo.persistPaymentStatus.mockReset();
  mockRepo.releaseSlots.mockReset();
  mockRepo.lockSlots.mockReset();
  mockRepo.createCancellation.mockReset();
  (eventBusV2.emit as Mock).mockReset();
  initBooking(mockRepo as any);
});

describe('BookingSaga', () => {
  describe('confirmBooking', () => {
    it('confirms pending booking with paid status — emits booking:confirmed', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { confirmBooking } = await importSaga();

      const result = await confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' });

      expect(result.status).toBe('confirmed');
      expect(result.bookingId).toBe(1);
      expect(result.userId).toBe(42);
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'confirmed', 'paid', undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:confirmed', expect.objectContaining({
        bookingId: 1, status: 'confirmed',
      }));
    });

    it('rejects confirm from non-pending status — no DB write, no event', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow();
      expect(mockRepo.persistTransition).not.toHaveBeenCalled();
      expect(eventBusV2.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking', () => {
    it('cancels pending booking — emits booking:cancelled', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { cancelBooking } = await importSaga();

      const result = await cancelBooking(1, 99, 'User cancelled');

      expect(result.status).toBe('cancelled');
      expect(mockRepo.createCancellation).toHaveBeenCalledWith(1, 99, 'User cancelled', 0, undefined);
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'cancelled', 'pending', undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:cancelled', expect.objectContaining({
        bookingId: 1, status: 'cancelled',
      }));
    });

    it('rejects cancel from terminal status — no DB write, no event', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'completed' });
      const { cancelBooking } = await importSaga();

      await expect(cancelBooking(1, 99, 'Test')).rejects.toThrow();
      expect(mockRepo.persistTransition).not.toHaveBeenCalled();
      expect(eventBusV2.emit).not.toHaveBeenCalled();
    });
  });

  describe('expireBooking', () => {
    it('expires pending booking — emits booking:expired', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { expireBooking } = await importSaga();

      const result = await expireBooking(1);

      expect(result.status).toBe('expired');
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'expired', 'expired', undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:expired', expect.objectContaining({
        bookingId: 1, status: 'expired',
      }));
    });
  });

  describe('checkInBooking', () => {
    it('checks in confirmed booking — emits booking:check-in', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { checkInBooking } = await importSaga();

      const result = await checkInBooking(1);

      expect(result.status).toBe('checked_in');
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'checked_in', undefined, undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:check-in', expect.objectContaining({
        bookingId: 1, status: 'checked_in',
      }));
    });
  });

  describe('noShowBooking', () => {
    it('marks no-show on confirmed unpaid booking', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'confirmed', payment_status: 'pending' });
      const { noShowBooking } = await importSaga();

      const result = await noShowBooking(1, 99, 'No show');

      expect(result.status).toBe('no_show');
      expect(mockRepo.createCancellation).toHaveBeenCalledWith(1, 99, 'No show', 0, undefined);
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'no_show', 'pending', undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:no-show', expect.objectContaining({
        bookingId: 1, status: 'no_show',
      }));
    });
  });

  describe('completeBooking', () => {
    it('completes confirmed booking — emits booking:completed', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { completeBooking } = await importSaga();

      const result = await completeBooking(1);

      expect(result.status).toBe('completed');
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'completed', undefined, undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:completed', expect.objectContaining({
        bookingId: 1, status: 'completed',
      }));
    });
  });

  describe('cancelWithFeeBooking', () => {
    it('cancels confirmed booking with fee — emits booking:cancelled', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockBooking, booking_status: 'confirmed' });
      const { cancelWithFeeBooking } = await importSaga();

      const result = await cancelWithFeeBooking(1, 99, 'Late cancellation', 50);

      expect(result.status).toBe('cancelled_with_fee');
      expect(mockRepo.createCancellation).toHaveBeenCalledWith(1, 99, 'Late cancellation', 50, undefined);
      expect(mockRepo.persistTransition).toHaveBeenCalledWith(1, 'cancelled_with_fee', 'partially_refunded', undefined, undefined);
      expect(eventBusV2.emit).toHaveBeenCalledWith('booking:cancelled', expect.objectContaining({
        bookingId: 1, status: 'cancelled_with_fee',
      }));
    });
  });

  describe('event payload consistency', () => {
    it('all emitted events share the same base shape', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { confirmBooking, expireBooking } = await importSaga();

      await confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' });
      const confirmPayload = (eventBusV2.emit as Mock).mock.calls[0][1];

      vi.clearAllMocks();
      mockRepo.findById.mockResolvedValue(mockBooking);
      await expireBooking(1);
      const expirePayload = (eventBusV2.emit as Mock).mock.calls[0][1];

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
      mockRepo.findById.mockResolvedValue(mockBooking);
      mockRepo.persistTransition.mockRejectedValue(new Error('DB error'));
      const { confirmBooking } = await importSaga();

      await expect(confirmBooking(1, { paymentStatus: 'paid', paymentMethod: 'card' })).rejects.toThrow('DB error');
      expect(eventBusV2.emit).not.toHaveBeenCalled();
    });
  });

  describe('cancelBooking releases slots', () => {
    it('calls repo.releaseSlots on cancel', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { cancelBooking } = await importSaga();

      await cancelBooking(1, 99, 'User cancelled');

      expect(mockRepo.releaseSlots).toHaveBeenCalledWith(1, undefined);
    });
  });

  describe('expireBooking releases slots', () => {
    it('calls repo.releaseSlots on expire', async () => {
      mockRepo.findById.mockResolvedValue(mockBooking);
      const { expireBooking } = await importSaga();

      await expireBooking(1);

      expect(mockRepo.releaseSlots).toHaveBeenCalledWith(1, undefined);
    });
  });
});
