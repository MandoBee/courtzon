import { vi, describe, it, expect, beforeEach } from 'vitest';

// Focused regression for the BOOKING.PREPARE audit entityId type mismatch.
// audit_logs.entity_id is INT UNSIGNED; passing the UUID prepareId caused
// MySQL "Data truncated" and the audit write failed silently. The controller
// must pass the numeric payment_transactions.id (result.paymentId) instead,
// preserving the UUID prepare session key as after-state metadata.

const recordAuditMock = vi.hoisted(() => vi.fn());
vi.mock('../../audit-log/index.js', () => ({ recordAudit: recordAuditMock }));

vi.mock('../application/booking.service.js', () => ({
  bookingService: { prepareGatewayBooking: vi.fn() },
}));

import { prepareBookingHandler } from '../presentation/booking.controller.js';
import { bookingService } from '../application/booking.service.js';

describe('BOOKING.PREPARE audit — numeric entityId compatible with audit_logs.entity_id', () => {
  beforeEach(() => {
    recordAuditMock.mockClear();
    (bookingService.prepareGatewayBooking as any).mockClear();
  });

  it('passes the numeric paymentId (payment_transactions.id) as entityId — not the UUID prepareId', async () => {
    const prepareId = '9f4c0f7a-3a4b-4c5d-8e6f-123456789abc';
    const paymentId = 9012345;
    (bookingService.prepareGatewayBooking as any).mockResolvedValue({
      prepareId,
      paymentId,
      clientSecret: 'cs_test',
    });

    const request: any = {
      body: {
        branchId: 1,
        resourceId: 7,
        bookingType: 'private_match',
        bookingDate: '2026-12-01',
        startTime: '10:00',
        endTime: '11:00',
        paymentMethod: 'card',
      },
      headers: { 'user-agent': 'vitest' },
      ip: '127.0.0.1',
      userId: 42,
    };
    const reply: any = { send: () => {} };

    await prepareBookingHandler(request, reply);

    expect(recordAuditMock).toHaveBeenCalledTimes(1);
    const entry = recordAuditMock.mock.calls[0][0];

    // The actual intended numeric identifier (the payment_transactions.id from
    // the prepare flow) — NOT merely "a number".
    expect(entry.entityId).toBe(paymentId);
    expect(typeof entry.entityId).toBe('number');
    // The UUID session key must NOT be placed in the INT UNSIGNED column.
    expect(entry.entityId).not.toBe(prepareId);

    // Existing audit semantics preserved.
    expect(entry.action).toBe('BOOKING.PREPARE');
    expect(entry.entityType).toBe('booking_prepare');
    expect(entry.actorId).toBe(42);
    expect(entry.afterState).toEqual({ resourceId: 7, prepareId });
    expect(entry.ipAddress).toBe('127.0.0.1');
    expect(entry.userAgent).toBe('vitest');
  });
});