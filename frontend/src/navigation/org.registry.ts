import type { NavDefinition } from './types';
import { T, LIT } from './labels';
import { buildNavIdKeyMaps } from './id-key';

export const ORG_NAV: NavDefinition[] = [
  { id: 'nav.org.dashboard', label: LIT('Dashboard'), icon: '📊', path: '/org/{orgId}/dashboard', permissionKey: 'org.sidebar.dashboard' },
  { id: 'nav.org.marketplace', label: LIT('Products'), icon: '🛒', path: '/org/{orgId}/marketplace', permissionKey: 'org.sidebar.marketplace' },
  { id: 'nav.org.orders', label: LIT('Orders'), icon: '📦', path: '/org/{orgId}/orders', permissionKey: 'org.sidebar.orders' },
  { id: 'nav.org.bookings', label: LIT('Bookings'), icon: '📅', path: '/org/{orgId}/bookings', permissionKey: 'org.sidebar.bookings' },
  { id: 'nav.org.staff', label: LIT('Staff'), icon: '👥', path: '/org/{orgId}/staff', permissionKey: 'org.sidebar.staff' },
  { id: 'nav.org.members', label: LIT('Members'), icon: '🎫', path: '/org/{orgId}/members', permissionKey: 'org.sidebar.members' },
  { id: 'nav.org.coaches', label: LIT('Coaches'), icon: '🎾', path: '/org/{orgId}/coaches', permissionKey: 'org.sidebar.coaches' },
  { id: 'nav.org.finance', label: LIT('Finance'), icon: '💰', path: '/org/{orgId}/finance', permissionKey: 'org.sidebar.finance' },
  {
    id: 'nav.org.accounting',
    label: LIT('Accounting'),
    icon: '📒',
    path: '/org/{orgId}/accounting/dashboard',
    permissionKey: 'org.sidebar.accounting',
    children: [
      { id: 'nav.org.accounting-dashboard', label: LIT('Dashboard'), path: '/org/{orgId}/accounting/dashboard', permissionKey: 'org.accounting.view' },
      { id: 'nav.org.accounting-coa', label: LIT('Chart of Accounts'), path: '/org/{orgId}/accounting/coa', permissionKey: 'org.accounting.view' },
      {
        id: 'nav.org.accounting-reports',
        label: LIT('Financial Reports'),
        path: '/org/{orgId}/accounting/reports/trial-balance',
        permissionKey: 'org.accounting.view',
        children: [
          { id: 'nav.org.accounting-trial-balance', label: LIT('Trial Balance'), path: '/org/{orgId}/accounting/reports/trial-balance', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-income-statement', label: LIT('Income Statement'), path: '/org/{orgId}/accounting/reports/income-statement', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-balance-sheet', label: LIT('Balance Sheet'), path: '/org/{orgId}/accounting/reports/balance-sheet', permissionKey: 'org.accounting.view' },
        ],
      },
      { id: 'nav.org.accounting-tax', label: LIT('Tax Summary'), path: '/org/{orgId}/accounting/tax-summary', permissionKey: 'org.accounting.view' },
    ],
  },
  { id: 'nav.org.announcements', label: T('org.sidebar.announcements'), icon: '📢', path: '/org/{orgId}/announcements', permissionKey: 'org.sidebar.announcements' },
  { id: 'nav.org.documents', label: T('org.sidebar.documents'), icon: '📄', path: '/org/{orgId}/documents', permissionKey: 'org.sidebar.documents' },
  { id: 'nav.org.gallery', label: T('org.sidebar.gallery'), icon: '🖼️', path: '/org/{orgId}/gallery', permissionKey: 'org.sidebar.gallery' },
  { id: 'nav.org.profile', label: T('org.sidebar.profile'), icon: '🏛️', path: '/org/{orgId}/profile', permissionKey: 'org.sidebar.profile' },
  { id: 'nav.org.branches', label: T('org.sidebar.branches'), icon: '🏢', path: '/org/{orgId}/branches', permissionKey: 'org.sidebar.branches' },
  { id: 'nav.org.working-hours', label: T('org.sidebar.working_hours'), icon: '🕐', path: '/org/{orgId}/working-hours', permissionKey: 'org.sidebar.working-hours' },
  { id: 'nav.org.payment', label: T('org.sidebar.payment_settings'), icon: '💳', path: '/org/{orgId}/payment-settings', permissionKey: 'org.sidebar.payment' },
  { id: 'nav.org.reviews', label: T('org.sidebar.reviews'), icon: '⭐', path: '/org/{orgId}/reviews', permissionKey: 'org.sidebar.reviews' },
  { id: 'nav.org.referees', label: T('org.sidebar.referees'), icon: '🧑‍⚖️', path: '/org/{orgId}/referees', permissionKey: 'org.sidebar.referees' },
  { id: 'nav.org.academies', label: T('org.sidebar.academies'), icon: '🎓', path: '/org/{orgId}/academies', permissionKey: 'org.sidebar.academies' },
  { id: 'nav.org.leagues', label: T('org.sidebar.leagues'), icon: '🏅', path: '/org/{orgId}/leagues', permissionKey: 'org.sidebar.leagues' },
  { id: 'nav.org.tournaments', label: T('org.sidebar.tournaments'), icon: '🏆', path: '/org/{orgId}/tournaments', permissionKey: 'org.sidebar.tournaments' },
  { id: 'nav.org.verification', label: T('org.sidebar.verification'), icon: '✅', path: '/org/{orgId}/verification', permissionKey: 'org.sidebar.verification' },
  { id: 'nav.org.subscription', label: LIT('Subscription'), icon: '📋', path: '/org/{orgId}/subscription', permissionKey: 'org.sidebar.subscription' },
  { id: 'nav.org.settings', label: LIT('Settings'), icon: '⚙️', path: '/org/{orgId}/settings', permissionKey: 'org.sidebar.settings' },
];

const { idToKey, keyToIds } = buildNavIdKeyMaps(ORG_NAV);

export const ORG_ID_TO_KEY: ReadonlyMap<string, string> = idToKey;
export const ORG_LEGACY_KEY_TO_ID: ReadonlyMap<string, string[]> = keyToIds;
