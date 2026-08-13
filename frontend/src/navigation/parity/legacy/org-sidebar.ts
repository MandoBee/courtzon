import { t } from '../../../i18n';

export interface NavItem {
  label: string;
  icon?: string;
  path: string;
  permissionKey: string;
  children?: NavItem[];
}

export function buildLegacyOrgNavItems(can: (perm: string) => boolean, orgId: string): NavItem[] {
  const allItems: NavItem[] = [
    { label: 'Dashboard', icon: '📊', path: `/org/${orgId}/dashboard`, permissionKey: 'org.sidebar.dashboard' },
    { label: 'Products', icon: '🛒', path: `/org/${orgId}/marketplace`, permissionKey: 'org.sidebar.marketplace' },
    { label: 'Orders', icon: '📦', path: `/org/${orgId}/orders`, permissionKey: 'org.sidebar.orders' },
    { label: 'Bookings', icon: '📅', path: `/org/${orgId}/bookings`, permissionKey: 'org.sidebar.bookings' },
    { label: 'Staff', icon: '👥', path: `/org/${orgId}/staff`, permissionKey: 'org.sidebar.staff' },
    { label: 'Members', icon: '🎫', path: `/org/${orgId}/members`, permissionKey: 'org.sidebar.members' },
    { label: 'Coaches', icon: '🎾', path: `/org/${orgId}/coaches`, permissionKey: 'org.sidebar.coaches' },
    { label: 'Finance', icon: '💰', path: `/org/${orgId}/finance`, permissionKey: 'org.sidebar.finance' },
    {
      label: 'Accounting',
      icon: '📒',
      path: `/org/${orgId}/accounting/dashboard`,
      permissionKey: 'org.sidebar.accounting',
      children: [
        { label: 'Dashboard', path: `/org/${orgId}/accounting/dashboard`, permissionKey: 'org.accounting.view' },
        { label: 'Chart of Accounts', path: `/org/${orgId}/accounting/coa`, permissionKey: 'org.accounting.view' },
        {
          label: 'Financial Reports',
          path: `/org/${orgId}/accounting/reports/trial-balance`,
          permissionKey: 'org.accounting.view',
          children: [
            { label: 'Trial Balance', path: `/org/${orgId}/accounting/reports/trial-balance`, permissionKey: 'org.accounting.view' },
            { label: 'Income Statement', path: `/org/${orgId}/accounting/reports/income-statement`, permissionKey: 'org.accounting.view' },
            { label: 'Balance Sheet', path: `/org/${orgId}/accounting/reports/balance-sheet`, permissionKey: 'org.accounting.view' },
          ],
        },
        { label: 'Tax Summary', path: `/org/${orgId}/accounting/tax-summary`, permissionKey: 'org.accounting.view' },
      ],
    },
    { label: t('org.sidebar.announcements'), icon: '📢', path: `/org/${orgId}/announcements`, permissionKey: 'org.sidebar.announcements' },
    { label: t('org.sidebar.documents'), icon: '📄', path: `/org/${orgId}/documents`, permissionKey: 'org.sidebar.documents' },
    { label: t('org.sidebar.gallery'), icon: '🖼️', path: `/org/${orgId}/gallery`, permissionKey: 'org.sidebar.gallery' },
    { label: t('org.sidebar.profile'), icon: '🏛️', path: `/org/${orgId}/profile`, permissionKey: 'org.sidebar.profile' },
    { label: t('org.sidebar.branches'), icon: '🏢', path: `/org/${orgId}/branches`, permissionKey: 'org.sidebar.branches' },
    { label: t('org.sidebar.working_hours'), icon: '🕐', path: `/org/${orgId}/working-hours`, permissionKey: 'org.sidebar.working-hours' },
    { label: t('org.sidebar.payment_settings'), icon: '💳', path: `/org/${orgId}/payment-settings`, permissionKey: 'org.sidebar.payment' },
    { label: t('org.sidebar.reviews'), icon: '⭐', path: `/org/${orgId}/reviews`, permissionKey: 'org.sidebar.reviews' },
    { label: t('org.sidebar.referees'), icon: '🧑‍⚖️', path: `/org/${orgId}/referees`, permissionKey: 'org.sidebar.referees' },
    { label: t('org.sidebar.academies'), icon: '🎓', path: `/org/${orgId}/academies`, permissionKey: 'org.sidebar.academies' },
    { label: t('org.sidebar.leagues'), icon: '🏅', path: `/org/${orgId}/leagues`, permissionKey: 'org.sidebar.leagues' },
    { label: t('org.sidebar.tournaments'), icon: '🏆', path: `/org/${orgId}/tournaments`, permissionKey: 'org.sidebar.tournaments' },
    { label: t('org.sidebar.verification'), icon: '✅', path: `/org/${orgId}/verification`, permissionKey: 'org.sidebar.verification' },
    { label: 'Subscription', icon: '📋', path: `/org/${orgId}/subscription`, permissionKey: 'org.sidebar.subscription' },
    { label: 'Settings', icon: '⚙️', path: `/org/${orgId}/settings`, permissionKey: 'org.sidebar.settings' },
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
