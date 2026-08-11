export interface NavItem {
  label: string;
  icon: string;
  path: string;
  permissionKey: string;
  requiredFlag?: string;
  children?: NavItem[];
}

export function buildSections(): NavItem[] {
  return [
    { label: 'Dashboard', icon: '📊', path: '/admin', permissionKey: 'sidebar.dashboard' },
    { label: 'Reports', icon: '📈', path: '/admin/reports', permissionKey: 'sidebar.reports' },
    {
      label: 'Organisations', icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations',
      children: [
        { label: 'All Organisations', icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations' },
        { label: 'Branch Access', icon: '🔑', path: '/admin/branch-access', permissionKey: 'sidebar.branch-access' },
        { label: 'All Bookings', icon: '📅', path: '/admin/bookings', permissionKey: 'sidebar.admin-bookings' },
        { label: 'Subscription Plans', icon: '📋', path: '/admin/subscription', permissionKey: 'sidebar.subscription' },
        { label: 'Types', icon: '🏷️', path: '/admin/organisation-types', permissionKey: 'sidebar.organisation-types' },
        { label: 'Settlements', icon: '💰', path: '/admin/settlements', permissionKey: 'sidebar.settlements' },
      ],
    },
    {
      label: 'Roles & Permissions', icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles',
      children: [
        { label: 'All Roles', icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles' },
        { label: 'Permissions', icon: '🔑', path: '/admin/permissions', permissionKey: 'sidebar.permissions' },
      ],
    },
    {
      label: 'Marketplace', icon: '🛒', path: '/admin/product-categories', permissionKey: 'sidebar.marketplace', requiredFlag: 'app.marketplace_enabled',
      children: [
        { label: 'Products', icon: '📦', path: '/admin/marketplace/products', permissionKey: 'sidebar.marketplace-products' },
        { label: 'Orders', icon: '📋', path: '/admin/marketplace/orders', permissionKey: 'sidebar.marketplace-orders' },
        { label: 'Sellers', icon: '👤', path: '/admin/marketplace/sellers', permissionKey: 'sidebar.marketplace-sellers' },
        { label: 'Product Categories', icon: '📂', path: '/admin/product-categories', permissionKey: 'sidebar.product-categories' },
        { label: 'Registrations', icon: '📝', path: '/admin/approvals', permissionKey: 'sidebar.marketplace-approvals' },
        { label: 'Reviews', icon: '⭐', path: '/admin/marketplace/reviews', permissionKey: 'sidebar.marketplace-reviews' },
        { label: 'Brands', icon: '🏷️', path: '/admin/brands', permissionKey: 'sidebar.brands' },
        { label: 'Tags', icon: '🔖', path: '/admin/tags', permissionKey: 'sidebar.tags' },
      ],
    },
    { label: 'Tournaments', icon: '🏆', path: '/admin/tournaments', permissionKey: 'sidebar.tournaments-admin' },
    { label: 'Academies', icon: '🎓', path: '/admin/academies', permissionKey: 'sidebar.academies-admin' },
    { label: 'Coaches', icon: '👨‍🏫', path: '/admin/coaches', permissionKey: 'sidebar.coaches-admin' },
    { label: 'Community Events', icon: '🎉', path: '/admin/community-events', permissionKey: 'sidebar.community-admin' },
    { label: 'Ads', icon: '📢', path: '/admin/ads', permissionKey: 'sidebar.ads', requiredFlag: 'community.events_enabled' },
    {
      label: 'Accounting', icon: '💰', path: '/admin/accounting/dashboard', permissionKey: 'sidebar.accounting',
      children: [
        { label: 'Dashboard', icon: '📊', path: '/admin/accounting/dashboard', permissionKey: 'sidebar.accounting-dashboard' },
        { label: 'Chart of Accounts', icon: '📋', path: '/admin/accounting/accounts', permissionKey: 'sidebar.accounting-coa' },
        { label: 'Journal Entries', icon: '📝', path: '/admin/accounting/journal', permissionKey: 'sidebar.accounting-journal' },
        { label: 'General Ledger', icon: '📒', path: '/admin/accounting/ledger', permissionKey: 'sidebar.accounting-gl' },
        { label: 'Invoices', icon: '🧾', path: '/admin/accounting/invoices', permissionKey: 'sidebar.accounting-invoices' },
        { label: 'Periods', icon: '📅', path: '/admin/accounting/periods', permissionKey: 'sidebar.accounting-periods' },
        { label: 'Tax Rates', icon: '🏷️', path: '/admin/accounting/tax-rates', permissionKey: 'sidebar.accounting-tax' },
      ],
    },
    {
      label: 'Admin Settings', icon: '⚙️', path: '/admin/sports', permissionKey: 'sidebar.admin-settings',
      children: [
        { label: 'Sports', icon: '🏅', path: '/admin/sports', permissionKey: 'sidebar.sports' },
        {
          label: 'Finance', icon: '💰', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.finance',
          children: [
            { label: 'Withdrawal Requests', icon: '💸', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.withdrawal-requests' },
            { label: 'Coupons', icon: '🏷️', path: '/admin/coupons', permissionKey: 'sidebar.coupons' },
            { label: 'Banks', icon: '🏦', path: '/admin/banks', permissionKey: 'sidebar.banks' },
            { label: 'Bank Branches', icon: '🏧', path: '/admin/bank-branches', permissionKey: 'sidebar.bank-branches' },
          ],
        },
        {
          label: 'Payments Config', icon: '💳', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods',
          children: [
            { label: 'Payment Methods', icon: '💳', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods' },
            { label: 'Gateway Config', icon: '🔌', path: '/admin/payment-gateways', permissionKey: 'sidebar.payment-gateways' },
          ],
        },
        {
          label: 'Localization', icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries',
          children: [
            { label: 'Countries', icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries' },
            { label: 'Currencies', icon: '💱', path: '/admin/currencies', permissionKey: 'sidebar.currencies' },
            { label: 'Languages', icon: '🔤', path: '/admin/languages', permissionKey: 'sidebar.languages' },
            { label: 'Translations', icon: '🌐', path: '/admin/translations', permissionKey: 'sidebar.translations' },
          ],
        },
        { label: 'Amenities', icon: '🏟️', path: '/admin/amenities', permissionKey: 'sidebar.amenities' },
        {
          label: 'App Settings', icon: '⚙️', path: '/admin/sidebar-layout', permissionKey: 'sidebar.app-settings-menu',
          children: [
            { label: 'Set Sidebar Layout', icon: '📐', path: '/admin/sidebar-layout', permissionKey: 'sidebar.layout.manage' },
            { label: 'Branding', icon: '🎨', path: '/admin/app-settings', permissionKey: 'sidebar.app-settings' },
            { label: 'Appearance Studio', icon: '✨', path: '/admin/design-tokens', permissionKey: 'sidebar.design-tokens' },
            { label: 'CMS', icon: '📝', path: '/admin/cms', permissionKey: 'sidebar.cms' },
          ],
        },
      ],
    },
    { label: 'Users', icon: '👥', path: '/admin/users', permissionKey: 'sidebar.users' },
    {
      label: 'Security', icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard',
      children: [
        { label: 'Security Dashboard', icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard' },
        { label: 'Active Sessions', icon: '🔵', path: '/admin/security/sessions', permissionKey: 'sidebar.active-sessions' },
        { label: 'Failed Logins', icon: '❌', path: '/admin/security/failed-logins', permissionKey: 'sidebar.failed-logins' },
        { label: 'Upload Security', icon: '📎', path: '/admin/security/uploads', permissionKey: 'sidebar.upload-security' },
        { label: 'System Health', icon: '💚', path: '/admin/security/system-health', permissionKey: 'sidebar.system-health' },
        { label: 'Audit Log', icon: '📋', path: '/admin/audit-logs', permissionKey: 'sidebar.audit' },
        { label: 'Feature Flags', icon: '🚩', path: '/admin/feature-flags', permissionKey: 'sidebar.feature-flags' },
      ],
    },
  ];
}
