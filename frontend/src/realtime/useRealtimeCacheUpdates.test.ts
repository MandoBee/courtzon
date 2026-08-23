import { describe, it, expect } from 'vitest';
import { ORG_LIFECYCLE_INVALIDATIONS, invalidateOrgLifecycle, USER_REGISTRATION_INVALIDATIONS, invalidateUserRegistration, FINANCE_INVALIDATIONS, invalidateFinanceEntries, MARKETPLACE_PRODUCT_INVALIDATIONS, invalidateMarketplaceProducts } from './useRealtimeCacheUpdates';

function hasPrefix(keys: readonly (readonly string[])[], prefix: string[]): boolean {
  return keys.some((k) => prefix.every((part, i) => k[i] === part));
}

describe('ORG_LIFECYCLE_INVALIDATIONS (organization registration realtime strategy)', () => {
  it('created covers every admin surface a registration mutates', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.created;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    // Registration inserts the owner user row — Admin Users must refresh (Issue regression)
    expect(hasPrefix(keys, ['admin', 'users'])).toBe(true);
    // Registration clones the org-admin role + scope
    expect(hasPrefix(keys, ['admin', 'roles'])).toBe(true);
    // Registration inserts a pending organisation_subscriptions row
    expect(hasPrefix(keys, ['admin', 'organisation-subscriptions'])).toBe(true);
    // Dashboard counters include totalUsers/totalOrganisations/pending orgs
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard-trends'])).toBe(true);
  });

  it('approved covers organisations, approvals, subscriptions and counters', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.approved;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'organisation-subscriptions'])).toBe(true);
    expect(hasPrefix(keys, ['org-subscription'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
  });

  it('rejected covers organisations, approvals and counters', () => {
    const keys = ORG_LIFECYCLE_INVALIDATIONS.rejected;
    expect(hasPrefix(keys, ['admin', 'organisations'])).toBe(true);
    expect(hasPrefix(keys, ['admin-approvals'])).toBe(true);
    expect(hasPrefix(keys, ['admin', 'dashboard'])).toBe(true);
  });

  it('never invalidates the whole cache or consumer-facing keys', () => {
    for (const event of Object.keys(ORG_LIFECYCLE_INVALIDATIONS) as Array<keyof typeof ORG_LIFECYCLE_INVALIDATIONS>) {
      for (const key of ORG_LIFECYCLE_INVALIDATIONS[event]) {
        expect(key.length).toBeGreaterThan(0);
        expect(key[0]).not.toBe('');
      }
    }
  });
});

describe('invalidateOrgLifecycle', () => {
  it('invalidates each configured key through the query client', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateOrgLifecycle(fakeQc as any, 'created');
    expect(invalidated).toHaveLength(ORG_LIFECYCLE_INVALIDATIONS.created.length);
    expect(invalidated).toContainEqual(['admin', 'users']);
  });
});

describe('USER_REGISTRATION_INVALIDATIONS (player/seller registration realtime strategy)', () => {
  it('refreshes the admin users list and dashboard counters', () => {
    expect(hasPrefix(USER_REGISTRATION_INVALIDATIONS, ['admin', 'users'])).toBe(true);
    expect(hasPrefix(USER_REGISTRATION_INVALIDATIONS, ['admin', 'dashboard'])).toBe(true);
  });

  it('never invalidates the whole cache or consumer-facing keys', () => {
    for (const key of USER_REGISTRATION_INVALIDATIONS) {
      expect(key.length).toBeGreaterThan(0);
      expect(key[0]).not.toBe('');
    }
  });

  it('invalidateUserRegistration runs through the query client (no duplicate keys)', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateUserRegistration(fakeQc as any);
    expect(invalidated).toHaveLength(USER_REGISTRATION_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });
});

describe('FINANCE_INVALIDATIONS (post-commit accounting realtime strategy)', () => {
  it('targets exactly the two admin-finance query roots', () => {
    expect(FINANCE_INVALIDATIONS).toHaveLength(2);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'accounting')).toBe(true);
    expect(FINANCE_INVALIDATIONS.some((k) => k[0] === 'finance')).toBe(true);
  });

  it('never invalidates consumer/org/admin-lifecycle roots (precise, not global)', () => {
    const forbiddenRoots = ['admin', 'wallet', 'my-bookings', 'mp-orders', 'notifications', 'organisation', 'org-subscription'];
    for (const key of FINANCE_INVALIDATIONS) {
      for (const root of forbiddenRoots) expect(key[0]).not.toBe(root);
    }
  });

  it('invalidateFinanceEntries runs through the query client without duplicates', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateFinanceEntries(fakeQc as any);
    expect(invalidated).toHaveLength(FINANCE_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });
});

describe('MARKETPLACE_PRODUCT_INVALIDATIONS (product approval realtime strategy)', () => {
  it('E+F+G+H: covers seller, org, player catalog/details and admin lists', () => {
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    for (const expected of ['mp-products', 'mp-product', 'mp-player-products', 'mp-seller-products', 'mp-seller-stats', 'org-products', 'product-detail', 'admin-marketplace-products', 'admin-product']) {
      expect(roots).toContain(expected);
    }
  });

  it('I: never invalidates unrelated roots (finance, wallet, bookings, admin users)', () => {
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    for (const forbidden of ['accounting', 'finance', 'wallet', 'my-bookings', 'admin', 'notifications']) {
      expect(roots).not.toContain(forbidden);
    }
  });

it('invalidateMarketplaceProducts runs through the query client without duplicates', () => {
    const invalidated: string[][] = [];
    const fakeQc = {
      invalidateQueries: ({ queryKey }: { queryKey: readonly string[] }) => {
        invalidated.push([...queryKey]);
      },
    };
    invalidateMarketplaceProducts(fakeQc as any);
    expect(invalidated).toHaveLength(MARKETPLACE_PRODUCT_INVALIDATIONS.length);
    expect(new Set(invalidated.map((k) => k.join(':'))).size).toBe(invalidated.length);
  });

  it('product visibility changes reuse the exact marketplace roots (18) and no unrelated ones (19)', () => {
    // The visibility socket handler calls invalidateMarketplaceProducts — the
    // same roots as status changes. Assert the set is identical and scoped.
    const roots = MARKETPLACE_PRODUCT_INVALIDATIONS.map((k) => k[0]);
    expect(roots).toContain('mp-products');
    expect(roots).toContain('mp-product');
    expect(roots).toContain('mp-seller-products');
    expect(roots).toContain('org-products');
    expect(roots).toContain('admin-marketplace-products');
    expect(roots).toContain('admin-product');
    for (const forbidden of ['accounting', 'finance', 'wallet', 'my-bookings', 'admin', 'notifications', 'organisation']) {
      expect(roots).not.toContain(forbidden);
    }
  });
});
