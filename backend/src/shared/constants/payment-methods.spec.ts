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

  it('context filter leaves other contexts unchanged (backward compatible)', () => {
    // default/signup context still only excludes wallet
    expect(isPaymentMethodAllowedInContext('e-wallet', '')).toBe(true);
    expect(isPaymentMethodAllowedInContext('wallet', '')).toBe(false);
    // booking/marketplace unchanged
    expect(isPaymentMethodAllowedInContext('wallet', 'booking')).toBe(true);
    expect(isPaymentMethodAllowedInContext('penalty', 'booking')).toBe(false);
    // wallet top-up unchanged
    expect(isPaymentMethodAllowedInContext('card', 'wallet')).toBe(true);
    expect(isPaymentMethodAllowedInContext('cash', 'wallet')).toBe(false);
  });
});
