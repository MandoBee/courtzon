export interface NavItem {
  label: string;
  icon?: string;
  path: string;
  permissionKey: string;
  requiredFlag?: string;
  children?: NavItem[];
}

export function buildLegacyAdminNavItems(
  t: (key: string) => string,
  can: (perm: string) => boolean,
  flag: (key: string) => boolean,
  savedLayout?: Map<string | null, string[]>,
): NavItem[] {
  const allItems: NavItem[] = [
    { label: t('admin.sidebar.dashboard'), icon: '📊', path: '/admin', permissionKey: 'sidebar.dashboard' },
    { label: t('admin.sidebar.reports'), icon: '📈', path: '/admin/reports', permissionKey: 'sidebar.reports' },
    {
      label: t('admin.sidebar.organisations'), icon: '🏢', path: '/admin/organisations', permissionKey: 'sidebar.organisations',
      children: [
        { label: 'All Organisations', path: '/admin/organisations', permissionKey: 'sidebar.organisations' },
        { label: 'Branch Access', path: '/admin/branch-access', permissionKey: 'sidebar.branch-access' },
        { label: 'All Bookings', path: '/admin/bookings', permissionKey: 'sidebar.admin-bookings' },
        { label: 'Subscription Plans', path: '/admin/subscription', permissionKey: 'sidebar.subscription' },
        { label: 'Subscription Requests', path: '/admin/subscription/requests', permissionKey: 'sidebar.subscription-requests' },
        { label: t('admin.sidebar.organisation_types'), path: '/admin/organisation-types', permissionKey: 'sidebar.organisation-types' },
        { label: t('admin.sidebar.settlements'), path: '/admin/settlements', permissionKey: 'sidebar.settlements' },
      ],
    },
    {
      label: t('admin.sidebar.roles') + ' & ' + t('admin.sidebar.permissions'), icon: '🔐', path: '/admin/roles', permissionKey: 'sidebar.roles',
      children: [
        { label: t('admin.sidebar.roles'), path: '/admin/roles', permissionKey: 'sidebar.roles' },
        { label: t('admin.sidebar.permissions'), path: '/admin/permissions', permissionKey: 'sidebar.permissions' },
      ],
    },
    {
      label: t('admin.sidebar.marketplace'), icon: '🛒', path: '/admin/product-categories', permissionKey: 'sidebar.marketplace', requiredFlag: 'app.marketplace_enabled',
      children: [
        { label: t('admin.sidebar.products'), path: '/admin/marketplace/products', permissionKey: 'sidebar.marketplace-products' },
        { label: t('admin.sidebar.orders'), path: '/admin/marketplace/orders', permissionKey: 'sidebar.marketplace-orders' },
        { label: t('admin.sidebar.sellers'), path: '/admin/marketplace/sellers', permissionKey: 'sidebar.marketplace-sellers' },
        { label: 'Product Categories', path: '/admin/product-categories', permissionKey: 'sidebar.product-categories' },
        { label: t('admin.sidebar.registrations'), path: '/admin/approvals', permissionKey: 'sidebar.marketplace-approvals' },
        { label: t('admin.sidebar.reviews'), path: '/admin/marketplace/reviews', permissionKey: 'sidebar.marketplace-reviews' },
        { label: t('admin.sidebar.brands'), path: '/admin/brands', permissionKey: 'sidebar.brands' },
        { label: t('admin.sidebar.tags'), path: '/admin/tags', permissionKey: 'sidebar.tags' },
      ],
    },
    {
      label: 'BI', icon: '📊', path: '/admin/bi/dashboard', permissionKey: 'sidebar.bi',
      children: [
        { label: 'Dashboard', path: '/admin/bi/dashboard', permissionKey: 'sidebar.bi-dashboard' },
        { label: 'Observability', path: '/admin/bi/observability', permissionKey: 'sidebar.bi-observability' },
      ],
    },
    { label: 'Sports Engine', icon: '🧠', path: '/admin/sports-engine', permissionKey: 'sidebar.sports-engine' },
    { label: t('admin.sidebar.reception'), icon: '🏪', path: '/admin/reception', permissionKey: 'sidebar.reception' },
    {
      label: t('admin.sidebar.league'), icon: '🏅', path: '/admin/league/dashboard', permissionKey: 'sidebar.league',
      children: [
        { label: t('admin.sidebar.league_dashboard'), path: '/admin/league/dashboard', permissionKey: 'sidebar.league-dashboard' },
        { label: t('admin.sidebar.league_seasons'), path: '/admin/league/seasons', permissionKey: 'sidebar.league-seasons' },
        { label: t('admin.sidebar.league_list'), path: '/admin/league/list', permissionKey: 'sidebar.league-list' },
        { label: t('admin.sidebar.league_divisions'), path: '/admin/league/divisions', permissionKey: 'sidebar.league-divisions' },
      ],
    },
    {
      label: t('admin.sidebar.tournament'), icon: '🏆', path: '/admin/tournament/dashboard', permissionKey: 'sidebar.tournament',
      children: [
        { label: t('admin.sidebar.tournament_dashboard'), path: '/admin/tournament/dashboard', permissionKey: 'sidebar.tournament-dashboard' },
        { label: t('admin.sidebar.tournament_list'), path: '/admin/tournament/list', permissionKey: 'sidebar.tournament-list' },
        { label: t('admin.sidebar.tournament_matches'), path: '/admin/tournament/matches', permissionKey: 'sidebar.tournament-matches' },
      ],
    },
    {
      label: t('admin.sidebar.academy'), icon: '🎓', path: '/admin/academy/dashboard', permissionKey: 'sidebar.academy',
      children: [
        { label: t('admin.sidebar.academy_dashboard'), path: '/admin/academy/dashboard', permissionKey: 'sidebar.academy-dashboard' },
        { label: t('admin.sidebar.academy_programs'), path: '/admin/academy/programs', permissionKey: 'sidebar.academy-programs' },
        { label: t('admin.sidebar.academy_groups'), path: '/admin/academy/groups', permissionKey: 'sidebar.academy-groups' },
        { label: t('admin.sidebar.academy_enrollments'), path: '/admin/academy/enrollments', permissionKey: 'sidebar.academy-enrollments' },
        { label: t('admin.sidebar.academy_attendance'), path: '/admin/academy/attendance', permissionKey: 'sidebar.academy-attendance' },
      ],
    },
    { label: t('admin.sidebar.coaches'), icon: '👨‍🏫', path: '/admin/coaches', permissionKey: 'sidebar.coaches-admin' },
    {
      label: t('admin.sidebar.membership'), icon: '⭐', path: '/admin/membership/plans', permissionKey: 'sidebar.membership',
      children: [
        { label: t('admin.sidebar.plans'), path: '/admin/membership/plans', permissionKey: 'membership.plans' },
        { label: t('admin.sidebar.campaigns'), path: '/admin/membership/campaigns', permissionKey: 'membership.campaigns' },
        { label: t('admin.sidebar.rewards'), path: '/admin/membership/rewards', permissionKey: 'membership.rewards' },
      ],
    },
    {
      label: t('admin.sidebar.pricing'), icon: '💰', path: '/admin/pricing/rules', permissionKey: 'sidebar.pricing',
      children: [
        { label: t('admin.sidebar.rules'), path: '/admin/pricing/rules', permissionKey: 'pricing.rules' },
        { label: 'Price Preview', path: '/admin/pricing/preview', permissionKey: 'pricing.preview' },
      ],
    },
    {
      label: 'CRM', icon: '🤝', path: '/admin/crm/dashboard', permissionKey: 'sidebar.crm',
      children: [
        { label: 'Dashboard', path: '/admin/crm/dashboard', permissionKey: 'sidebar.crm-dashboard' },
        { label: 'Customers', path: '/admin/crm/customers', permissionKey: 'sidebar.crm-customers' },
        { label: 'Segments', path: '/admin/crm/segments', permissionKey: 'sidebar.crm-segments' },
        { label: 'Leads', path: '/admin/crm/leads', permissionKey: 'sidebar.crm-leads' },
        { label: 'Campaigns', path: '/admin/crm/campaigns', permissionKey: 'sidebar.crm-campaigns' },
        { label: 'Communications', path: '/admin/crm/communications', permissionKey: 'sidebar.crm-communications' },
      ],
    },
    {
      label: 'HR', icon: '👥', path: '/admin/hr/dashboard', permissionKey: 'sidebar.hr',
      children: [
        { label: 'Dashboard', path: '/admin/hr/dashboard', permissionKey: 'sidebar.hr-dashboard' },
        { label: 'Employees', path: '/admin/hr/employees', permissionKey: 'sidebar.hr-employees' },
        { label: 'Departments', path: '/admin/hr/departments', permissionKey: 'sidebar.hr-departments' },
        { label: 'Leave', path: '/admin/hr/leave', permissionKey: 'sidebar.hr-leave' },
        { label: 'Attendance', path: '/admin/hr/attendance', permissionKey: 'sidebar.hr-attendance' },
        { label: 'Payroll', path: '/admin/hr/payroll', permissionKey: 'sidebar.hr-payroll' },
      ],
    },
    { label: 'Community Events', icon: '🎉', path: '/admin/community-events', permissionKey: 'sidebar.community-admin' },
    {
      label: t('admin.sidebar.notifications'), icon: '🔔', path: '/admin/notifications/broadcast', permissionKey: 'sidebar.notifications',
      children: [
        { label: t('admin.sidebar.broadcast'), path: '/admin/notifications/broadcast', permissionKey: 'notifications.broadcast' },
        { label: t('admin.sidebar.analytics'), path: '/admin/notifications/analytics', permissionKey: 'notifications.analytics' },
        { label: 'Dead Letters', path: '/admin/notifications/dead-letters', permissionKey: 'notifications.dead-letters' },
        { label: t('admin.sidebar.templates'), path: '/admin/templates', permissionKey: 'notification_templates.view' },
        { label: 'Types', path: '/admin/notification-types', permissionKey: 'notification_types.view' },
        { label: '⚙️ Config', path: '/admin/notifications/config', permissionKey: 'notifications.config.manage' },
      ],
    },
    { label: t('admin.sidebar.ads'), icon: '📢', path: '/admin/ads', permissionKey: 'sidebar.ads', requiredFlag: 'community.events_enabled' },
    {
      label: 'Admin Settings', icon: '⚙️', path: '/admin/sports', permissionKey: 'sidebar.admin-settings',
      children: [
        { label: t('admin.sidebar.sports'), path: '/admin/sports', permissionKey: 'sidebar.sports' },
        {
          label: t('admin.sidebar.finance'), path: '/admin/finance', permissionKey: 'sidebar.finance',
          children: [
            { label: 'Finance Dashboard', path: '/admin/finance', permissionKey: 'sidebar.finance-dashboard' },
            { label: t('admin.sidebar.ledger'), path: '/admin/finance/ledger', permissionKey: 'sidebar.finance-ledger' },
            { label: 'Reports', path: '/admin/finance/reports', permissionKey: 'sidebar.finance-reports' },
            { label: 'Withdrawal Requests', path: '/admin/withdrawal-requests', permissionKey: 'sidebar.withdrawal-requests' },
            { label: 'Withdrawals Queue', path: '/admin/withdrawals', permissionKey: 'sidebar.withdrawals-queue' },
            { label: t('admin.sidebar.coupons'), path: '/admin/coupons', permissionKey: 'sidebar.coupons' },
            { label: 'Finance (Legacy)', path: '/admin/financial-ops', permissionKey: 'sidebar.finance-transactions' },
            { label: t('admin.sidebar.banks'), path: '/admin/banks', permissionKey: 'sidebar.banks' },
            { label: 'Bank Branches', path: '/admin/bank-branches', permissionKey: 'sidebar.bank-branches' },
          ],
        },
        {
          label: 'Payments Config', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods',
          children: [
            { label: 'Payment Methods', path: '/admin/payment-methods', permissionKey: 'sidebar.payment-methods' },
            { label: 'Gateway Config', path: '/admin/payment-gateways', permissionKey: 'sidebar.payment-gateways' },
          ],
        },
        {
          label: t('admin.sidebar.localization'), icon: '🌍', path: '/admin/countries', permissionKey: 'sidebar.countries',
          children: [
            { label: t('admin.sidebar.countries'), path: '/admin/countries', permissionKey: 'sidebar.countries' },
            { label: t('admin.sidebar.currencies'), path: '/admin/currencies', permissionKey: 'sidebar.currencies' },
            { label: t('admin.sidebar.languages'), path: '/admin/languages', permissionKey: 'sidebar.languages' },
            { label: t('admin.sidebar.translations'), path: '/admin/translations', permissionKey: 'sidebar.translations' },
          ],
        },
        { label: t('admin.sidebar.amenities'), path: '/admin/amenities', permissionKey: 'sidebar.amenities' },
        {
          label: 'App Settings', path: '/admin/sidebar-layout', permissionKey: 'sidebar.app-settings-menu',
          children: [
            { label: 'Set Sidebar Layout', path: '/admin/sidebar-layout', permissionKey: 'sidebar.layout.manage' },
            { label: t('admin.sidebar.branding'), path: '/admin/app-settings', permissionKey: 'sidebar.app-settings' },
            { label: 'Appearance Studio', path: '/admin/design-tokens', permissionKey: 'sidebar.design-tokens' },
            { label: 'CMS', path: '/admin/cms', permissionKey: 'sidebar.cms' },
          ],
        },
      ],
    },
    { label: t('admin.sidebar.users'), icon: '👥', path: '/admin/users', permissionKey: 'sidebar.users' },
    {
      label: 'Inventory', icon: '📦', path: '/admin/inventory/stock', permissionKey: 'sidebar.inventory',
      children: [
        { label: 'Stock Levels', path: '/admin/inventory/stock', permissionKey: 'sidebar.inventory-stock' },
        { label: 'Warehouses', path: '/admin/inventory/warehouses', permissionKey: 'sidebar.inventory-warehouses' },
        { label: 'Suppliers', path: '/admin/inventory/suppliers', permissionKey: 'sidebar.inventory-suppliers' },
        { label: 'Purchase Orders', path: '/admin/inventory/purchase-orders', permissionKey: 'sidebar.inventory-purchase-orders' },
      ],
    },
    { label: 'Mobile', icon: '📱', path: '/admin/mobile/dashboard', permissionKey: 'sidebar.mobile' },
    { label: 'Integration', icon: '🔌', path: '/admin/integration/api-keys', permissionKey: 'sidebar.integration' },
    { label: t('admin.sidebar.webhooks'), icon: '🔗', path: '/admin/webhooks', permissionKey: 'sidebar.webhooks' },
    {
      label: t('admin.sidebar.security'), icon: '🛡️', path: '/admin/security', permissionKey: 'sidebar.security-dashboard',
      children: [
        { label: 'Security Dashboard', path: '/admin/security', permissionKey: 'sidebar.security-dashboard' },
        { label: 'Active Sessions', path: '/admin/security/sessions', permissionKey: 'sidebar.active-sessions' },
        { label: 'Failed Logins', path: '/admin/security/failed-logins', permissionKey: 'sidebar.failed-logins' },
        { label: 'Upload Security', path: '/admin/security/uploads', permissionKey: 'sidebar.upload-security' },
        { label: 'System Health', path: '/admin/security/system-health', permissionKey: 'sidebar.system-health' },
        { label: 'System Admin', path: '/admin/system', permissionKey: 'system_settings.view' },
        { label: 'Membership', path: '/admin/membership', permissionKey: 'membership.view' },
        { label: 'Audit Log', path: '/admin/audit-logs', permissionKey: 'sidebar.audit' },
        { label: 'Feature Flags', path: '/admin/feature-flags', permissionKey: 'sidebar.feature-flags' },
        { label: 'Support Tickets', path: '/admin/support/tickets', permissionKey: 'support.tickets.view' },
        { label: 'Queue Management', path: '/admin/queues', permissionKey: 'queue.view' },
      ],
    },
  ];

  const filterItem = (item: NavItem): boolean => {
    if (item.requiredFlag && !flag(item.requiredFlag)) return false;
    if (item.children && item.children.length > 0) {
      item.children = item.children.filter(filterItem);
      return item.children.length > 0;
    }
    return can(item.permissionKey);
  };

  if (savedLayout) {
    const leaf = allItems.filter((i) => !i.children);
    const sections = allItems.filter((i) => i.children);
    const topOrder = savedLayout.get(null);
    if (topOrder) {
      const orderedLeaf = topOrder.map((k) => leaf.find((i) => i.permissionKey === k)).filter(Boolean) as NavItem[];
      const remainingLeaf = leaf.filter((i) => !topOrder.includes(i.permissionKey));
      allItems.length = 0;
      allItems.push(...orderedLeaf, ...sections, ...remainingLeaf);
    }
    for (const section of sections) {
      const order = savedLayout.get(section.permissionKey);
      if (order && section.children) {
        const ordered = order.map((k) => section.children!.find((c) => c.permissionKey === k)).filter(Boolean) as NavItem[];
        const remaining = section.children.filter((c) => !order.includes(c.permissionKey));
        section.children = [...ordered, ...remaining];
      }
    }
  }

  return allItems.filter(filterItem);
}
