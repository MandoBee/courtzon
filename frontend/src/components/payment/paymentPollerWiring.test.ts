import { describe, it, expect } from 'vitest';
import subscriptionSource from '../subscription/SubscriptionRequestModal.tsx?raw';
import organizationSource from '../../pages/landing/OrganizationRegisterPage.tsx?raw';
import sellerSource from '../../pages/landing/SellerRegisterPage.tsx?raw';

/**
 * P3-10 guard — all three card-payment flows must poll with a payment id that
 * survives closing the card modal (`setPaymentInfo(null)` runs before polling).
 *
 * The P3-06 purity fix replaced the render-time `paymentIdRef.current` read with
 * `paymentInfo?.paymentId`, which silently disabled the fallback poller in every
 * flow. `SubscriptionRequestModal.paymentPolling.test.tsx` proves the behaviour;
 * this source guard keeps the identical wiring in the two registration pages,
 * which are too large to mount without a brittle multi-step harness.
 */

const CASES: Array<[string, string]> = [
  ['SubscriptionRequestModal', subscriptionSource],
  ['OrganizationRegisterPage', organizationSource],
  ['SellerRegisterPage', sellerSource],
];

describe('payment fallback poller wiring', () => {
  it.each(CASES)('%s gates the poller on state that survives the card modal', (name, source) => {
    expect(source, name).toContain('pollingPaid && pollingPaymentId > 0');
    expect(source, name).toContain('/payments/status/${pollingPaymentId}');
    expect(source, name).not.toContain('pollingPaid && paymentInfo?.paymentId');
  });
});
