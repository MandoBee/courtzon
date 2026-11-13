// ============================================================================
// R1-B — canonical payment → entitlement scope resolver.
//
// Unit-only: the MySQL pool is mocked per SQL statement. No DB connection.
// ============================================================================
import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '3307';
process.env.DB_USER = 'root';
process.env.DB_PASSWORD = 'x';
process.env.DB_NAME = 'courtzon_v3';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';

const execute = vi.fn(async () => [[], []] as any);
vi.mock('../../../database/mysql.js', () => ({
  getPool: () => ({ execute }),
}));

const { resolvePaymentRefundScope } = await import('../application/payment-refund-scope.js');

const payment = (overrides: Record<string, any> = {}) => ({
  id: 900,
  reference_type: 'booking',
  reference_id: 55,
  booking_id: 55,
  order_id: null,
  ...overrides,
});

const route = (sql: string) => {
  if (sql.includes('FROM bookings WHERE id = ?')) return [[{ id: 55, organisation_id: 7 }], []];
  if (sql.includes('WHERE series_id = ?')) return [[
    { id: 55, organisation_id: 7 },
    { id: 56, organisation_id: 7 },
  ], []];
  if (sql.includes('FROM order_items oi')) return [[
    { item_id: 501, organisation_id: 7 },
    { item_id: 502, organisation_id: 8 },
  ], []];
  if (sql.includes('FROM academy_enrollments')) return [[{ organisation_id: 7 }], []];
  if (sql.includes('FROM tournament_registrations')) return [[{ organisation_id: 7 }], []];
  if (sql.includes('FROM membership_subscriptions')) return [[{ id: 71, organisation_id: 7 }], []];
  if (sql.includes('FROM membership_installments')) return [[{ id: 101 }, { id: 102 }], []];
  return [[], []];
};

describe('R1-B — resolvePaymentRefundScope', () => {
  beforeEach(() => {
    execute.mockReset();
    execute.mockImplementation(async (sql: string) => route(String(sql)) as any);
  });

  it('subscription has NO entitlements and needs no query', async () => {
    const scope = await resolvePaymentRefundScope(payment({ reference_type: 'subscription', reference_id: 3 }) as any);
    expect(scope).toMatchObject({ hasEntitlements: false, entitlementScopes: [], organisationIds: [] });
    expect(execute).not.toHaveBeenCalled();
  });

  it('wallet_topup has NO entitlements', async () => {
    const scope = await resolvePaymentRefundScope(payment({ reference_type: 'wallet_topup', reference_id: 3 }) as any);
    expect(scope.hasEntitlements).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it('booking resolves the booking id + organisation', async () => {
    const scope = await resolvePaymentRefundScope(payment() as any);
    expect(scope).toMatchObject({
      referenceType: 'booking',
      hasEntitlements: true,
      organisationIds: [7],
      entitlementScopes: [{ sourceType: 'booking', sourceIds: [55] }],
    });
  });

  it('booking_series resolves EVERY occurrence booking', async () => {
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'booking_series', reference_id: 12, booking_id: null }) as any,
    );
    expect(scope.entitlementScopes).toEqual([{ sourceType: 'booking', sourceIds: [55, 56] }]);
    expect(scope.organisationIds).toEqual([7]);
  });

  it('order resolves every item (all sellers) of the checkout group', async () => {
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'order', reference_id: null, booking_id: null, order_id: 300 }) as any,
    );
    expect(scope.entitlementScopes).toEqual([{ sourceType: 'marketplace', sourceIds: [501, 502] }]);
    expect(scope.organisationIds).toEqual([7, 8]);
  });

  it('academy resolves the enrollment → program organisation', async () => {
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'academy', reference_id: 11, booking_id: null }) as any,
    );
    expect(scope.entitlementScopes).toEqual([{ sourceType: 'academy', sourceIds: [11] }]);
    expect(scope.organisationIds).toEqual([7]);
  });

  it('tournament resolves the registration → tournament organisation', async () => {
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'tournament', reference_id: 41, booking_id: null }) as any,
    );
    expect(scope.entitlementScopes).toEqual([{ sourceType: 'tournament', sourceIds: [41] }]);
    expect(scope.organisationIds).toEqual([7]);
  });

  it('membership resolves BOTH installment and subscription entitlement scopes', async () => {
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'membership_subscription', reference_id: 71, booking_id: null }) as any,
    );
    expect(scope.entitlementScopes).toEqual([
      { sourceType: 'membership', sourceIds: [71, 101, 102] },
    ]);
    expect(scope.organisationIds).toEqual([7]);
  });

  it('fails closed on an unknown reference type', async () => {
    await expect(
      resolvePaymentRefundScope(payment({ reference_type: 'mystery' }) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when the reference type is missing', async () => {
    await expect(resolvePaymentRefundScope(payment({ reference_type: null }) as any)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('fails closed when the booking does not exist', async () => {
    execute.mockImplementationOnce(async () => [[], []] as any);
    await expect(resolvePaymentRefundScope(payment() as any)).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when a booking series has no occurrences', async () => {
    execute.mockImplementationOnce(async () => [[], []] as any);
    await expect(
      resolvePaymentRefundScope(payment({ reference_type: 'booking_series', reference_id: 12 }) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when an order has no items (ambiguous composition)', async () => {
    execute.mockImplementationOnce(async () => [[], []] as any);
    await expect(
      resolvePaymentRefundScope(
        payment({ reference_type: 'order', reference_id: null, order_id: 300, booking_id: null }) as any,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when an academy program has no organisation', async () => {
    execute.mockImplementationOnce(async () => [[{ organisation_id: null }], []] as any);
    await expect(
      resolvePaymentRefundScope(payment({ reference_type: 'academy', reference_id: 11 }) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when a tournament has no organisation', async () => {
    execute.mockImplementationOnce(async () => [[{ organisation_id: null }], []] as any);
    await expect(
      resolvePaymentRefundScope(payment({ reference_type: 'tournament', reference_id: 41 }) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('fails closed when a membership subscription does not exist', async () => {
    execute.mockImplementationOnce(async () => [[], []] as any);
    await expect(
      resolvePaymentRefundScope(payment({ reference_type: 'membership_subscription', reference_id: 71 }) as any),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('de-duplicates and sorts organisation ids (multi-seller group)', async () => {
    execute.mockImplementation(async (sql: string) => {
      if (String(sql).includes('FROM order_items oi')) {
        return [[
          { item_id: 501, organisation_id: 8 },
          { item_id: 502, organisation_id: 7 },
          { item_id: 503, organisation_id: 8 },
        ], []];
      }
      return [[], []];
    });
    const scope = await resolvePaymentRefundScope(
      payment({ reference_type: 'order', reference_id: null, order_id: 300, booking_id: null }) as any,
    );
    expect(scope.organisationIds).toEqual([7, 8]);
    expect(scope.entitlementScopes[0].sourceIds).toEqual([501, 502, 503]);
  });
});
