import type { NavDefinition } from './types';
import { T, LIT } from './labels';

export const ORG_NAV: NavDefinition[] = [
  { id: 'org.sidebar.dashboard', label: LIT('Dashboard'), icon: '📊', path: '/org/{orgId}/dashboard', permissionKey: 'org.sidebar.dashboard' },
  { id: 'org.sidebar.marketplace', label: LIT('Products'), icon: '🛒', path: '/org/{orgId}/marketplace', permissionKey: 'org.sidebar.marketplace' },
  { id: 'org.sidebar.orders', label: LIT('Orders'), icon: '📦', path: '/org/{orgId}/orders', permissionKey: 'org.sidebar.orders' },
  { id: 'org.sidebar.bookings', label: LIT('Bookings'), icon: '📅', path: '/org/{orgId}/bookings', permissionKey: 'org.sidebar.bookings' },
  { id: 'org.sidebar.staff', label: LIT('Staff'), icon: '👥', path: '/org/{orgId}/staff', permissionKey: 'org.sidebar.staff' },
  { id: 'org.sidebar.members', label: LIT('Members'), icon: '🎫', path: '/org/{orgId}/members', permissionKey: 'org.sidebar.members' },
  { id: 'org.sidebar.coaches', label: LIT('Coaches'), icon: '🎾', path: '/org/{orgId}/coaches', permissionKey: 'org.sidebar.coaches' },
  { id: 'org.sidebar.finance', label: LIT('Finance'), icon: '💰', path: '/org/{orgId}/finance', permissionKey: 'org.sidebar.finance' },
  { id: 'org.sidebar.announcements', label: T('org.sidebar.announcements'), icon: '📢', path: '/org/{orgId}/announcements', permissionKey: 'org.sidebar.announcements' },
  { id: 'org.sidebar.documents', label: T('org.sidebar.documents'), icon: '📄', path: '/org/{orgId}/documents', permissionKey: 'org.sidebar.documents' },
  { id: 'org.sidebar.gallery', label: T('org.sidebar.gallery'), icon: '🖼️', path: '/org/{orgId}/gallery', permissionKey: 'org.sidebar.gallery' },
  { id: 'org.sidebar.profile', label: T('org.sidebar.profile'), icon: '🏛️', path: '/org/{orgId}/profile', permissionKey: 'org.sidebar.profile' },
  { id: 'org.sidebar.branches', label: T('org.sidebar.branches'), icon: '🏢', path: '/org/{orgId}/branches', permissionKey: 'org.sidebar.branches' },
  { id: 'org.sidebar.working_hours', label: T('org.sidebar.working_hours'), icon: '🕐', path: '/org/{orgId}/working-hours', permissionKey: 'org.sidebar.working-hours' },
  { id: 'org.sidebar.payment', label: T('org.sidebar.payment_settings'), icon: '💳', path: '/org/{orgId}/payment-settings', permissionKey: 'org.sidebar.payment' },
  { id: 'org.sidebar.reviews', label: T('org.sidebar.reviews'), icon: '⭐', path: '/org/{orgId}/reviews', permissionKey: 'org.sidebar.reviews' },
  { id: 'org.sidebar.referees', label: T('org.sidebar.referees'), icon: '🧑‍⚖️', path: '/org/{orgId}/referees', permissionKey: 'org.sidebar.referees' },
  { id: 'org.sidebar.academies', label: T('org.sidebar.academies'), icon: '🎓', path: '/org/{orgId}/academies', permissionKey: 'org.sidebar.academies' },
  { id: 'org.sidebar.leagues', label: T('org.sidebar.leagues'), icon: '🏅', path: '/org/{orgId}/leagues', permissionKey: 'org.sidebar.leagues' },
  { id: 'org.sidebar.tournaments', label: T('org.sidebar.tournaments'), icon: '🏆', path: '/org/{orgId}/tournaments', permissionKey: 'org.sidebar.tournaments' },
  { id: 'org.sidebar.verification', label: T('org.sidebar.verification'), icon: '✅', path: '/org/{orgId}/verification', permissionKey: 'org.sidebar.verification' },
  { id: 'org.sidebar.subscription', label: LIT('Subscription'), icon: '📋', path: '/org/{orgId}/subscription', permissionKey: 'org.sidebar.subscription' },
  { id: 'org.sidebar.settings', label: LIT('Settings'), icon: '⚙️', path: '/org/{orgId}/settings', permissionKey: 'org.sidebar.settings' },
];
