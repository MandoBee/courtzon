import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';

vi.mock('../../../modules/payment/infrastructure/repositories/payment.repository.js', () => ({
  paymentRepository: {
    findById: vi.fn(),
    create: vi.fn(),
    updateStatus: vi.fn(),
    expirePayment: vi.fn(),
  },
}));

vi.mock('../../../shared/event-bus/index.js', () => ({
  eventBus: { emit: vi.fn() },
}));

import { paymentRepository } from '../../../modules/payment/infrastructure/repositories/payment.repository.js';
import { eventBus } from '../../../shared/event-bus/index.js';

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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PaymentSaga', () => {
  describe('createPayment', () => {
    it('creates payment, emits payment:created', async () => {
      (paymentRepository.create as Mock).mockResolvedValue({ id: 1, traceId: 'trace_1' });
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'created' });
      const { createPayment } = await importSaga();

      const result = await createPayment({
        userId: 42, amount: 100, paymentMethod: 'card', gatewayProvider: 'paymob',
      });

      expect(result.status).toBe('created');
      expect(result.amount).toBe(100);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:created', expect.objectContaining({
        paymentId: 1, status: 'created',
      }));
    });
  });

  describe('emitPaymentCompleted', () => {
    it('emits payment:completed without persisting', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'paid' });
      const { emitPaymentCompleted } = await importSaga();

      const result = await emitPaymentCompleted(1);

      expect(result.status).toBe('paid');
      expect(result.paymentId).toBe(1);
      expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('payment:completed', expect.objectContaining({
        paymentId: 1, status: 'paid',
      }));
    });

    it('throws if payment not found', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(null);
      const { emitPaymentCompleted } = await importSaga();
      await expect(emitPaymentCompleted(999)).rejects.toThrow('Payment 999 not found');
    });
  });

  describe('startProcessing', () => {
    it('updates status to processing, emits payment:processing', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'processing' });
      const { startProcessing } = await importSaga();

      const result = await startProcessing(1, 'ref_456');

      expect(result.status).toBe('processing');
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(1, 'processing', 'ref_456', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:processing', expect.objectContaining({
        paymentId: 1, status: 'processing',
      }));
    });
  });

  describe('confirmPayment', () => {
    it('marks as paid, emits payment:completed', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'paid' });
      const { confirmPayment } = await importSaga();

      const result = await confirmPayment(1, { gatewayReference: 'ref_123', paidAmount: 100 });

      expect(result.status).toBe('paid');
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(1, 'paid', 'ref_123', undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:completed', expect.objectContaining({
        paymentId: 1, status: 'paid',
      }));
    });

    it('rejects from terminal status — no DB write, no event', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'refunded' });
      const { confirmPayment } = await importSaga();

      await expect(confirmPayment(1, { gatewayReference: 'ref', paidAmount: 100 })).rejects.toThrow();
      expect(paymentRepository.updateStatus).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('failPayment', () => {
    it('marks as failed, emits payment:failed', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'failed' });
      const { failPayment } = await importSaga();

      const result = await failPayment(1);

      expect(result.status).toBe('failed');
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(1, 'failed', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:failed', expect.objectContaining({
        paymentId: 1, status: 'failed',
      }));
    });
  });

  describe('cancelPayment', () => {
    it('marks as cancelled, emits payment:cancelled', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'created' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'created' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'cancelled' });
      const { cancelPayment } = await importSaga();

      const result = await cancelPayment(1);

      expect(result.status).toBe('cancelled');
      expect(paymentRepository.updateStatus).toHaveBeenCalledWith(1, 'cancelled', undefined, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:cancelled', expect.objectContaining({
        paymentId: 1, status: 'cancelled',
      }));
    });
  });

  describe('expirePayment', () => {
    it('expires payment, emits payment:expired', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce(mockPayment);
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'expired' });
      (paymentRepository.expirePayment as Mock).mockResolvedValue(true);
      const { expirePayment } = await importSaga();

      const result = await expirePayment(1);

      expect(result.status).toBe('expired');
      expect(paymentRepository.expirePayment).toHaveBeenCalledWith(1, undefined);
      expect(eventBus.emit).toHaveBeenCalledWith('payment:expired', expect.objectContaining({
        paymentId: 1, status: 'expired',
      }));
    });
  });

  describe('refundPayment', () => {
    it('refunds paid payment, emits payment:refunded', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'paid' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'paid' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'refunded' });
      const { refundPayment } = await importSaga();

      const result = await refundPayment(1, 100);

      expect(result.status).toBe('refunded');
      expect(eventBus.emit).toHaveBeenCalledWith('payment:refunded', expect.objectContaining({
        paymentId: 1, status: 'refunded',
      }));
    });
  });

  describe('partialRefundPayment', () => {
    it('partially refunds, emits payment:refunded', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'paid' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'paid' });
      (paymentRepository.findById as Mock).mockResolvedValueOnce({ ...mockPayment, payment_status: 'refunded' });
      const { partialRefundPayment } = await importSaga();

      const result = await partialRefundPayment(1, 30, 100);

      expect(result.status).toBe('refunded');
      expect(eventBus.emit).toHaveBeenCalledWith('payment:refunded', expect.objectContaining({
        paymentId: 1, status: 'refunded',
      }));
    });
  });

  describe('event payload consistency', () => {
    it('all events share the same base shape', async () => {
      (paymentRepository.create as Mock).mockResolvedValue({ id: 1, traceId: 't' });
      (paymentRepository.findById as Mock).mockResolvedValue({ ...mockPayment, payment_status: 'created' });
      const { createPayment } = await importSaga();

      await createPayment({ userId: 42, amount: 100, paymentMethod: 'card', gatewayProvider: 'paymob' });
      const payload = (eventBus.emit as Mock).mock.calls[0][1];

      expect(payload).toHaveProperty('paymentId');
      expect(payload).toHaveProperty('transactionId');
      expect(payload).toHaveProperty('amount');
      expect(payload).toHaveProperty('status');
      expect(payload).toHaveProperty('gatewayReference');
      expect(payload).toHaveProperty('timestamp');
    });
  });

  describe('repository failure — no event', () => {
    it('does not emit event on repository error', async () => {
      (paymentRepository.findById as Mock).mockResolvedValue(mockPayment);
      (paymentRepository.updateStatus as Mock).mockRejectedValue(new Error('DB error'));
      const { failPayment } = await importSaga();

      await expect(failPayment(1)).rejects.toThrow('DB error');
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
