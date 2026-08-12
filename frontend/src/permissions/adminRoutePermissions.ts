/**
 * Route-level permission map for /admin/*
 *
 * Every admin route is gated by the permission key below (longest-prefix match).
 * `super_admin` passes all checks because its permission set contains `*`.
 * Roles without the required key are redirected away from the route by AdminLayout.
 *
 * NOTE: only keys that exist in the `permissions` table / registry are used here.
 * Keep this list in sync with the /admin routes declared in App.tsx.
 */
export const ADMIN_ROUTE_PERMISSIONS: Record<string, string> = {
  '': 'dashboard.view',
  'organisations': 'organisations.view',
  'branch-access': 'organisations.view',
  'branches': 'organisations.view',
  'reports': 'reports.view',
  'roles': 'roles.view',
  'permissions': 'ui-permissions.view',
  'feature-flags': 'feature-flags.view',
  'cms': 'cms.view',
  'payment-methods': 'sidebar.payment-methods',
  'payment-gateways': 'sidebar.payment-gateways',
  'ads': 'ads.view',
  'amenities': 'sidebar.amenities',
  'banks': 'sidebar.banks',
  'bank-branches': 'sidebar.bank-branches',
  'users': 'users.view',
  'organisation-types': 'sidebar.organisation-types',
  'sports': 'sidebar.sports',
  'countries': 'sidebar.countries',
  'currencies': 'sidebar.currencies',
  'languages': 'sidebar.languages',
  'app-settings': 'sidebar.app-settings',
  'translations': 'sidebar.translations',
  'sidebar-layout': 'sidebar.layout.manage',
  'profile': 'profile.edit',
  'audit-logs': 'sidebar.audit',
  'subscription': 'sidebar.subscription',
  'security': 'security.dashboard',
  'settlements': 'settlements.view',
  'finance': 'financial.view',
  'finance/ledger': 'financial.view',
  'finance/reports': 'reports.view',
  'financial-ops': 'financial.view',
  'withdrawal-requests': 'financial.withdrawal-requests.view',
  'withdrawals': 'financial.withdrawals-queue.view',
  'coupons': 'coupons.view',
  'design-tokens': 'sidebar.design-tokens',
  'tournaments': 'sidebar.tournament',
  'tournament': 'sidebar.tournament',
  'league': 'sidebar.league',
  'academies': 'sidebar.academy',
  'academy': 'sidebar.academy',
  'membership': 'sidebar.membership',
  'pricing': 'pricing.rules',
  'coaches': 'sidebar.coaches-admin',
  'community-events': 'sidebar.community-admin',
  'notifications': 'sidebar.notifications',
  'notification-types': 'sidebar.notifications',
  'templates': 'sidebar.notifications',
  'system': 'app-settings.view',
  'product-categories': 'sidebar.marketplace',
  'marketplace/products': 'marketplace.admin.products',
  'marketplace/orders': 'marketplace.admin.orders',
  'marketplace/sellers': 'marketplace.admin.sellers',
  'marketplace/upgrade-requests': 'marketplace.admin.upgrades',
  'marketplace/reviews': 'marketplace.admin.reviews',
  'marketplace/shipping-rates': 'marketplace.admin.shipping-rates',
  'brands': 'sidebar.brands',
  'tags': 'sidebar.tags',
  'approvals': 'marketplace.admin.approvals',
  'reception': 'sidebar.reception',
  'support/tickets': 'support.tickets.view',
  'queues': 'queue.manage',
  'webhooks': 'sidebar.webhooks',
  'integration/api-keys': 'integration.api-keys.view',
  'inventory': 'sidebar.inventory',
  'accounting': 'sidebar.accounting',
  'accounting/mappings': 'sidebar.accounting-mappings',
  'accounting/templates': 'sidebar.accounting-templates',
  'crm': 'crm.dashboard.view',
  'hr': 'hr.dashboard.view',
  'bi': 'bi.dashboard.view',
  'sports-engine': 'sidebar.sports-engine',
  'mobile/dashboard': 'mobile.dashboard.view',
  'bookings': 'admin.bookings.view',
};

/** Explicit deny-list for restricted staff roles (e.g. accountant). */
export const ADMIN_DENY_PREFIXES = [
  'users',
  'roles',
  'permissions',
  'ui-permissions',
  'organisations',
  'branch-access',
  'branches',
  'system',
  'security',
  'audit-logs',
  'subscription',
  'settings',
];

/**
 * Resolve the permission key required to view an /admin route.
 * Longest-prefix match so nested routes inherit their section guard.
 */
export function getAdminRoutePermission(pathname: string): string | null {
  const rest = pathname.replace(/^\/admin/, '').replace(/^\//, '');
  if (rest === '') return ADMIN_ROUTE_PERMISSIONS[''];
  const segments = rest.split('/');
  for (let len = segments.length; len >= 1; len -= 1) {
    const candidate = segments.slice(0, len).join('/');
    if (ADMIN_ROUTE_PERMISSIONS[candidate]) return ADMIN_ROUTE_PERMISSIONS[candidate];
  }
  return null;
}

export function isAdminDeniedRoute(pathname: string): boolean {
  const rest = pathname.replace(/^\/admin/, '').replace(/^\//, '');
  return ADMIN_DENY_PREFIXES.some((prefix) => rest === prefix || rest.startsWith(`${prefix}/`));
}
