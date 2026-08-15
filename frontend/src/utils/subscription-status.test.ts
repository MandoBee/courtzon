import { describe, it, expect } from 'vitest';
import { subscriptionStatusLabel, isSubscriptionEnabled } from './subscription-status';

describe('subscriptionStatusLabel', () => {
  it('maps active to Active', () => {
    expect(subscriptionStatusLabel('active')).toBe('Active');
  });

  it('maps pending to Suspended (admin-suspend / pre-activation workflow state)', () => {
    expect(subscriptionStatusLabel('pending')).toBe('Suspended');
  });

  it('maps expired and cancelled to their terminal labels', () => {
    expect(subscriptionStatusLabel('expired')).toBe('Expired');
    expect(subscriptionStatusLabel('cancelled')).toBe('Cancelled');
  });

  it('falls back to No Subscription for null/undefined/unknown', () => {
    expect(subscriptionStatusLabel(null)).toBe('No Subscription');
    expect(subscriptionStatusLabel(undefined)).toBe('No Subscription');
    expect(subscriptionStatusLabel('weird')).toBe('No Subscription');
  });
});

describe('isSubscriptionEnabled', () => {
  it('is true only for active', () => {
    expect(isSubscriptionEnabled('active')).toBe(true);
    expect(isSubscriptionEnabled('pending')).toBe(false);
    expect(isSubscriptionEnabled('expired')).toBe(false);
    expect(isSubscriptionEnabled(null)).toBe(false);
  });
});
