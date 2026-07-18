import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

const mockRepo = {
  findById: vi.fn(),
  create: vi.fn(),
  updateStatus: vi.fn(),
  expirePayment: vi.fn(),
};

import { eventBus } from '../../../shared/event-bus/index.js';
import { initPayment } from '../PaymentSaga.js';

const mockPayment = {
  id: 1,
  user_id: 42,
  booking_id: 10,
  order_id: null,
  reference_type: 'booking',
  payment_method: 'card',
  gateway_provider: 'paymob',
  gateway_reference: 'ref_123',
  amount: 100,
  payment_status: 'pending',
};

async function importSaga() {
  return import('../PaymentSaga.js');
}

beforeEach(async () => {
  vi.clearAllMocks();
  initPayment(mockRepo as any);
});

describe('PaymentSaga', () => {
  describe('confirmPayment', () => {
    it('marks as paid, emits payment:completed', async () => {
      mockRepo.findById.mockResolvedValueOnce(mockPayment);
      mockRepo.findById.mockResolvedValueOnce({ ...mockPayment, payment_status: 'paid' });
      const { confirmPayment } = await importSaga();

      const result = await confirmPayment(1, { gatewayReference: 'ref_123', paidAmount: 100 });

      expect(result.status).toBe('paid');
      expect(mockRepo.updateStatus).toHaveBeenCalledWith(1, 'paid', 'ref_123', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:completed', expect.objectContaining({
        paymentId: 1, status: 'paid',
      }));
    });

    it('rejects from terminal status — no DB write, no event', async () => {
      mockRepo.findById.mockResolvedValue({ ...mockPayment, payment_status: 'refunded' });
      const { confirmPayment } = await importSaga();

      await expect(confirmPayment(1, { gatewayReference: 'ref', paidAmount: 100 })).rejects.toThrow();
      expect(mockRepo.updateStatus).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('expirePayment', () => {
    it('expires payment, emits payment:expired', async () => {
      mockRepo.findById.mockResolvedValueOnce(mockPayment);
      mockRepo.findById.mockResolvedValueOnce({ ...mockPayment, payment_status: 'expired' });
      mockRepo.expirePayment.mockResolvedValue(true);
      const { expirePayment } = await importSaga();

      const result = await expirePayment(1);

      expect(result.status).toBe('expired');
      expect(mockRepo.expirePayment).toHaveBeenCalledWith(1, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:expired', expect.objectContaining({
        paymentId: 1, status: 'expired',
      }));
    });
  });

  describe('refundPayment', () => {
    it('refunds paid payment, emits payment:refunded', async () => {
      mockRepo.findById.mockResolvedValueOnce({ ...mockPayment, payment_status: 'paid' });
      mockRepo.findById.mockResolvedValueOnce({ ...mockPayment, payment_status: 'refunded' });
      const { refundPayment } = await importSaga();

      const result = await refundPayment(1, 100);

      expect(result.status).toBe('refunded');
      expect(eventBus.emit).toHaveBeenCalledWith('payment:refunded', expect.objectContaining({
        paymentId: 1, status: 'refunded',
      }));
    });
  });

});
