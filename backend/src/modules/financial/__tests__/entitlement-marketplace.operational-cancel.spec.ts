// ============================================================================
// B1 — operational-only marketplace cancellation must not cancel entitlements.
// Unit-only: repository/service/event bus are mocked.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (envelope: any) => Promise<void>>,
  findOrderById: vi.fn(async () => [{ item_id: 501 }, { item_id: 502 }]),
  cancelBySourceIds: vi.fn(async () => 2),
}));

vi.mock('../../../shared/event-bus/event-bus.v2.js', () => ({
  eventBusV2: {
    subscribe: (registration: any) => {
      mocks.handlers[registration.eventName] = registration.handler;
    },
  },
}));
vi.mock('../../../database/mysql.js', () => ({ getPool: () => ({ execute: vi.fn() }) }));
vi.mock('../../../shared/event-bus/subscriber.worker.js', () => ({
  createSubscriberWorker: vi.fn(() => ({})),
}));
vi.mock('../../marketplace/infrastructure/repositories/marketplace.repository.js', () => ({
  marketplaceRepository: { findOrderById: mocks.findOrderById },
}));
vi.mock('../application/financial-entitlement.service.js', () => ({
  financialEntitlementService: { cancelBySourceIds: mocks.cancelBySourceIds },
}));

const { registerEntitlementMarketplaceSubscribers } = await import(
  '../application/entitlement-marketplace.listener.js'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('marketplace entitlement listener — operational-only cancellation', () => {
  it('does not cancel original entitlements when operationalOnly is set', async () => {
    registerEntitlementMarketplaceSubscribers();
    const handler = mocks.handlers['marketplace:order-cancelled'];

    await handler({
      payload: { orderId: 101, operationalOnly: true, reason: 'institution refund' },
    });

    expect(mocks.findOrderById).not.toHaveBeenCalled();
    expect(mocks.cancelBySourceIds).not.toHaveBeenCalled();
  });

  it('keeps legacy cancellation entitlement behaviour without the flag', async () => {
    const handler = mocks.handlers['marketplace:order-cancelled'];

    await handler({ payload: { orderId: 101, reason: 'legacy cancel' } });

    expect(mocks.findOrderById).toHaveBeenCalledWith(101);
    expect(mocks.cancelBySourceIds).toHaveBeenCalledWith('marketplace', [501, 502], 'legacy cancel');
  });
});
