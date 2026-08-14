import { t } from '../../../i18n';

export interface NavItem {
  label: string;
  icon?: string;
  path: string;
  permissionKey?: string;
  children?: NavItem[];
}

export function buildLegacyOrgNavItems(can: (perm: string) => boolean, orgId: string): NavItem[] {
  const p = (path: string) => `/org/${orgId}/${path}`;

  const allItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', path: p('dashboard'), permissionKey: 'org.sidebar.dashboard' },

    {
      label: 'Marketplace', icon: '🛒', path: p('marketplace'),
      children: [
        { label: 'Products', icon: '🛒', path: p('marketplace'), permissionKey: 'org.sidebar.marketplace' },
        { label: 'Orders', icon: '📦', path: p('orders'), permissionKey: 'org.sidebar.orders' },
        { label: 'Shipping Rate', icon: '⚙️', path: p('shipping-rates'), permissionKey: 'org.sidebar.settings' },
      ],
    },

    {
      label: 'People', icon: '👥', path: p('members'),
      children: [
        { label: 'Members', icon: '🎫', path: p('members'), permissionKey: 'org.sidebar.members' },
        { label: 'Staff', icon: '👤', path: p('staff'), permissionKey: 'org.sidebar.staff' },
        { label: 'Coaches', icon: '🎾', path: p('coaches'), permissionKey: 'org.sidebar.coaches' },
        { label: t('org.sidebar.referees'), icon: '🧑‍⚖️', path: p('referees'), permissionKey: 'org.sidebar.referees' },
      ],
    },

    {
      label: 'Sports & Programs', icon: '🏆', path: p('bookings'),
      children: [
        { label: 'Bookings', icon: '📅', path: p('bookings'), permissionKey: 'org.sidebar.bookings' },
        { label: t('org.sidebar.academies'), icon: '🎓', path: p('academies'), permissionKey: 'org.sidebar.academies' },
        { label: t('org.sidebar.leagues'), icon: '🏅', path: p('leagues'), permissionKey: 'org.sidebar.leagues' },
        { label: t('org.sidebar.tournaments'), icon: '🏆', path: p('tournaments'), permissionKey: 'org.sidebar.tournaments' },
      ],
    },

    {
      label: 'Finance & Accounting', icon: '💰', path: p('finance'),
      children: [
        { label: 'Booking Settlements', icon: '🤝', path: p('finance/bookings'), permissionKey: 'settlements.view' },
        {
          label: 'Accounting', icon: '📒', path: p('accounting/dashboard'), permissionKey: 'org.sidebar.accounting',
          children: [
            { label: 'Dashboard', path: p('accounting/dashboard'), permissionKey: 'org.accounting.view' },
            { label: 'Chart of Accounts', path: p('accounting/coa'), permissionKey: 'org.accounting.view' },
            { label: 'Manual Journal', path: p('accounting/journal'), permissionKey: 'org.accounting.journal.view' },
          ],
        },
        {
          label: 'Financial', path: p('accounting/reports/trial-balance'), permissionKey: 'org.accounting.view',
          children: [
            { label: 'Transactions & Settlements', icon: '💸', path: p('finance'), permissionKey: 'org.sidebar.finance' },
            { label: 'Trial Balance', path: p('accounting/reports/trial-balance'), permissionKey: 'org.accounting.view' },
            { label: 'Income Statement', path: p('accounting/reports/income-statement'), permissionKey: 'org.accounting.view' },
            { label: 'Balance Sheet', path: p('accounting/reports/balance-sheet'), permissionKey: 'org.accounting.view' },
            { label: 'Reports', icon: '📈', path: p('reports'), permissionKey: 'org.reports.view' },
            { label: 'Tax Summary', path: p('accounting/tax-summary'), permissionKey: 'org.accounting.view' },
          ],
        },
      ],
    },

    {
      label: 'Organisation', icon: '🏛️', path: p('profile'),
      children: [
        { label: 'Profile & Settings', icon: '🏛️', path: p('profile'), permissionKey: 'org.sidebar.profile' },
        { label: 'Branches & Resources', icon: '🏢', path: p('branches'), permissionKey: 'org.sidebar.branches' },
        { label: 'Subscription', icon: '📋', path: p('subscription'), permissionKey: 'org.sidebar.subscription' },
      ],
    },

    {
      label: 'Content & Comm.', icon: '📢', path: p('announcements'),
      children: [
        { label: t('org.sidebar.announcements'), icon: '📢', path: p('announcements'), permissionKey: 'org.sidebar.announcements' },
        { label: t('org.sidebar.documents'), icon: '📄', path: p('documents'), permissionKey: 'org.sidebar.documents' },
        { label: t('org.sidebar.gallery'), icon: '🖼️', path: p('gallery'), permissionKey: 'org.sidebar.gallery' },
        { label: t('org.sidebar.reviews'), icon: '⭐', path: p('reviews'), permissionKey: 'org.sidebar.reviews' },
        { label: t('org.sidebar.verification'), icon: '✅', path: p('verification'), permissionKey: 'org.sidebar.verification' },
      ],
    },
  ];

  const filterItem = (item: NavItem): NavItem | null => {
    if (item.children && item.children.length > 0) {
      const children = item.children.map(filterItem).filter((c): c is NavItem => c !== null);
      if (children.length === 0) return null;
      return { ...item, children };
    }
    if (item.permissionKey !== undefined && !can(item.permissionKey)) return null;
    return item;
  };

  return allItems.map(filterItem).filter((i): i is NavItem => i !== null);
}
