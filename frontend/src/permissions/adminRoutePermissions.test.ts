import { describe, it, expect } from 'vitest';
import { canAccessAdminPath, getAdminRoutePermission } from './adminRoutePermissions';

/**
 * UR-03 / UR-07 — fail-closed admin route mapping.
 *
 * A missing mapping must never be interpreted as permission to open an admin
 * surface. The five routes added here were previously unmapped and therefore
 * passed `canAccessAdminPath()` for every authenticated actor.
 */
describe('admin route permission map — fail closed', () => {
  it('requires platform.admin for the /admin landing route', () => {
    expect(getAdminRoutePermission('/admin')).toBe('platform.admin');
    expect(canAccessAdminPath('/admin', (p) => p === 'platform.admin')).toBe(true);
    expect(canAccessAdminPath('/admin', (p) => p === 'dashboard.view')).toBe(false);
  });

  it.each([
    ['/admin/ui-permissions', 'ui-permissions.view'],
    ['/admin/marketplace/complaints', 'marketplace.complaints.view'],
    ['/admin/refunds', 'refunds.view'],
    ['/admin/refunds/42', 'refunds.view'],
    ['/admin/recurring', 'admin.bookings.view'],
  ])('maps %s to %s', (path, key) => {
    expect(getAdminRoutePermission(path)).toBe(key);
    expect(canAccessAdminPath(path, (p) => p === key)).toBe(true);
    expect(canAccessAdminPath(path, (p) => p !== key)).toBe(false);
  });

  it('denies an unmapped admin path even when the actor holds every permission', () => {
    expect(getAdminRoutePermission('/admin/never-mapped')).toBeNull();
    expect(canAccessAdminPath('/admin/never-mapped', () => true)).toBe(false);
  });

  it('keeps longest-prefix matching for nested mapped routes', () => {
    expect(getAdminRoutePermission('/admin/finance/ledger')).toBe('financial.reports.view');
    expect(getAdminRoutePermission('/admin/marketplace/orders')).toBe('marketplace.admin.orders');
  });
});
