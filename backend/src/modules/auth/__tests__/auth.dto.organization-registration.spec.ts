import { describe, it, expect } from 'vitest';
import { OrganizationRegisterSchema } from '../presentation/auth.dto.js';

const basePayload = {
  countryId: 1,
  phoneNumber: '01012345678',
  fullName: 'Org Owner',
  email: 'owner@example.com',
  password: 'secret123',
  gender: 'male',
  birthDate: '1990-01-01',
  planId: 2,
  billingCycle: 'monthly' as const,
  orgName: 'Padel Club',
  orgTypeId: 1,
};

describe('OrganizationRegisterSchema paymentMethod', () => {
  it('accepts the supported registration methods (card/cash)', () => {
    for (const paymentMethod of ['card', 'cash', 'CARD', ' cash ']) {
      const result = OrganizationRegisterSchema.safeParse({ ...basePayload, paymentMethod });
      expect(result.success).toBe(true);
    }
  });

  it('rejects catalog methods that have no registration lifecycle (Issue regression)', () => {
    for (const paymentMethod of ['e-wallet', 'bank_transfer', 'penalty']) {
      const result = OrganizationRegisterSchema.safeParse({ ...basePayload, paymentMethod });
      expect(result.success).toBe(false);
    }
  });

  it('still rejects wallet', () => {
    const result = OrganizationRegisterSchema.safeParse({ ...basePayload, paymentMethod: 'wallet' });
    expect(result.success).toBe(false);
  });

  it('allows omitting paymentMethod (free plans)', () => {
    const result = OrganizationRegisterSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
  });
});
