import { describe, it, expect } from 'vitest';
import {
  filterOrganizationRegistrationPaymentMethods,
  filterSellerRegistrationPaymentMethods,
  DEFAULT_ORGANIZATION_PAYMENT_METHOD,
} from './registration';

const method = (id: number, slug: string, isActive = true) => ({ id, slug, isActive });

describe('filterOrganizationRegistrationPaymentMethods', () => {
  it('keeps only card and cash from the full catalog (Issue regression: e-wallet/bank_transfer/penalty must not render)', () => {
    const methods = [
      method(1, 'wallet'),
      method(2, 'cash'),
      method(3, 'card'),
      method(4, 'bank_transfer'),
      method(5, 'e-wallet'),
      method(6, 'penalty'),
    ];
    const result = filterOrganizationRegistrationPaymentMethods(methods);
    expect(result.map((m) => m.slug)).toEqual(['card', 'cash']);
  });

  it('drops inactive methods', () => {
    const result = filterOrganizationRegistrationPaymentMethods([method(3, 'card', false), method(2, 'cash')]);
    expect(result.map((m) => m.slug)).toEqual(['cash']);
  });

  it('sorts card first so the default method is offered first', () => {
    const result = filterOrganizationRegistrationPaymentMethods([method(2, 'cash'), method(3, 'card')]);
    expect(result[0].slug).toBe('card');
    expect(DEFAULT_ORGANIZATION_PAYMENT_METHOD).toBe('card');
  });

  it('returns empty for empty input', () => {
    expect(filterOrganizationRegistrationPaymentMethods([])).toEqual([]);
  });
});

describe('filterSellerRegistrationPaymentMethods (existing behavior regression)', () => {
  it('still keeps only card + cash with card first', () => {
    const result = filterSellerRegistrationPaymentMethods([
      method(4, 'bank_transfer'), method(2, 'cash'), method(1, 'wallet'), method(3, 'card'),
    ]);
    expect(result.map((m) => m.slug)).toEqual(['card', 'cash']);
  });
});
