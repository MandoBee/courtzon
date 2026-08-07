import { t } from '../../../i18n';

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  permissionKey: string;
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
  return allItems.filter((item) => can(item.permissionKey));
}
