import { describe, it, expect } from 'vitest';
import {
  isPaymentMethodAllowedInContext,
  isPaymentMethodAllowedForOrganizationRegistration,
  ORGANIZATION_REGISTRATION_PAYMENT_SLUGS,
} from './payment-methods.js';

describe('organization registration payment methods', () => {
  it('allows only card and cash', () => {
    expect([...ORGANIZATION_REGISTRATION_PAYMENT_SLUGS].sort()).toEqual(['card', 'cash']);
  });

  it('accepts card and cash for the organization-registration context (case/whitespace tolerant)', () => {
    expect(isPaymentMethodAllowedForOrganizationRegistration('card')).toBe(true);
    expect(isPaymentMethodAllowedForOrganizationRegistration(' Card ')).toBe(true);
    expect(isPaymentMethodAllowedForOrganizationRegistration('CASH')).toBe(true);
  });

  it('rejects catalog methods without a registration lifecycle', () => {
    expect(isPaymentMethodAllowedForOrganizationRegistration('e-wallet')).toBe(false);
    expect(isPaymentMethodAllowedForOrganizationRegistration('bank_transfer')).toBe(false);
    expect(isPaymentMethodAllowedForOrganizationRegistration('penalty')).toBe(false);
    expect(isPaymentMethodAllowedForOrganizationRegistration('wallet')).toBe(false);
  });

  it('context filter: organization-registration returns exactly card + cash from the seeded catalog', () => {
    const catalog = ['wallet', 'cash', 'card', 'bank_transfer', 'e-wallet', 'penalty'];
    const allowed = catalog.filter((slug) => isPaymentMethodAllowedInContext(slug, 'organization-registration'));
    expect([...allowed].sort()).toEqual(['card', 'cash']);
  });

  it('context filter: booking/marketplace allow card + cash only (PHASE 1 — wallet not an active payment method)', () => {
    expect(isPaymentMethodAllowedInContext('card', 'booking')).toBe(true);
    expect(isPaymentMethodAllowedInContext('cash', 'booking')).toBe(true);
    expect(isPaymentMethodAllowedInContext('card', 'marketplace')).toBe(true);
    expect(isPaymentMethodAllowedInContext('cash', 'marketplace')).toBe(true);
    // wallet is no longer an active payment method in booking/marketplace
    expect(isPaymentMethodAllowedInContext('wallet', 'booking')).toBe(false);
    expect(isPaymentMethodAllowedInContext('wallet', 'marketplace')).toBe(false);
    expect(isPaymentMethodAllowedInContext('wallet', 'checkout')).toBe(false);
    expect(isPaymentMethodAllowedInContext('penalty', 'booking')).toBe(false);
    // wallet top-up unchanged (card funding still allowed; cash still not)
    expect(isPaymentMethodAllowedInContext('card', 'wallet')).toBe(true);
    expect(isPaymentMethodAllowedInContext('cash', 'wallet')).toBe(false);
  });
});
