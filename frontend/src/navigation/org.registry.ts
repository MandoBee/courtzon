import type { NavDefinition } from './types';
import { T, LIT } from './labels';
import { buildNavIdKeyMaps } from './id-key';

export const ORG_NAV: NavDefinition[] = [
  // ── Dashboard (top-level) ──
  { id: 'nav.org.dashboard', label: LIT('Dashboard'), icon: '📊', path: '/org/{orgId}/dashboard', permissionKey: 'org.sidebar.dashboard' },

  // ── Marketplace (formerly Operations) ──
  {
    id: 'nav.org.domain.marketplace',
    label: LIT('Marketplace'),
    icon: '🛒',
    path: '/org/{orgId}/marketplace',
    children: [
      { id: 'nav.org.marketplace', label: LIT('Products'), icon: '🛒', path: '/org/{orgId}/marketplace', permissionKey: 'org.sidebar.marketplace' },
      { id: 'nav.org.orders', label: LIT('Orders'), icon: '📦', path: '/org/{orgId}/orders', permissionKey: 'org.sidebar.orders' },
      { id: 'nav.org.settings', label: LIT('Shipping Rate'), icon: '⚙️', path: '/org/{orgId}/shipping-rates', permissionKey: 'org.sidebar.settings' },
    ],
  },

  // ── People ──
  {
    id: 'nav.org.domain.people',
    label: LIT('People'),
    icon: '👥',
    path: '/org/{orgId}/members',
    children: [
      { id: 'nav.org.members', label: LIT('Members'), icon: '🎫', path: '/org/{orgId}/members', permissionKey: 'org.sidebar.members' },
      { id: 'nav.org.staff', label: LIT('Staff'), icon: '👤', path: '/org/{orgId}/staff', permissionKey: 'org.sidebar.staff' },
      { id: 'nav.org.coaches', label: LIT('Coaches'), icon: '🎾', path: '/org/{orgId}/coaches', permissionKey: 'org.sidebar.coaches' },
      { id: 'nav.org.referees', label: T('org.sidebar.referees'), icon: '🧑‍⚖️', path: '/org/{orgId}/referees', permissionKey: 'org.sidebar.referees' },
    ],
  },

  // ── Sports & Programs ──
  {
    id: 'nav.org.domain.sports',
    label: LIT('Sports & Programs'),
    icon: '🏆',
    path: '/org/{orgId}/bookings',
    children: [
      { id: 'nav.org.bookings', label: LIT('Bookings'), icon: '📅', path: '/org/{orgId}/bookings', permissionKey: 'org.sidebar.bookings' },
      { id: 'nav.org.academies', label: T('org.sidebar.academies'), icon: '🎓', path: '/org/{orgId}/academies', permissionKey: 'org.sidebar.academies' },
      { id: 'nav.org.leagues', label: T('org.sidebar.leagues'), icon: '🏅', path: '/org/{orgId}/leagues', permissionKey: 'org.sidebar.leagues' },
      { id: 'nav.org.tournaments', label: T('org.sidebar.tournaments'), icon: '🏆', path: '/org/{orgId}/tournaments', permissionKey: 'org.sidebar.tournaments' },
    ],
  },

  // ── Finance & Accounting (operational money movement + accounting records) ──
  {
    id: 'nav.org.domain.finance',
    label: LIT('Finance & Accounting'),
    icon: '💰',
    path: '/org/{orgId}/finance',
    children: [
      { id: 'nav.org.booking-settlements', label: LIT('Booking Settlements'), icon: '🤝', path: '/org/{orgId}/finance/bookings', permissionKey: 'settlements.view' },
      {
        id: 'nav.org.accounting',
        label: LIT('Accounting'),
        icon: '📒',
        path: '/org/{orgId}/accounting/dashboard',
        permissionKey: 'org.sidebar.accounting',
        children: [
          { id: 'nav.org.accounting-dashboard', label: LIT('Dashboard'), path: '/org/{orgId}/accounting/dashboard', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-coa', label: LIT('Chart of Accounts'), path: '/org/{orgId}/accounting/coa', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-journal', label: LIT('Manual Journal'), path: '/org/{orgId}/accounting/journal', permissionKey: 'org.accounting.journal.view' },
        ],
      },
      {
        id: 'nav.org.accounting-reports',
        label: LIT('Financial'),
        path: '/org/{orgId}/accounting/reports/trial-balance',
        permissionKey: 'org.accounting.view',
        children: [
          { id: 'nav.org.finance', label: LIT('Transactions & Settlements'), icon: '💸', path: '/org/{orgId}/finance', permissionKey: 'org.sidebar.finance' },
          { id: 'nav.org.accounting-trial-balance', label: LIT('Trial Balance'), path: '/org/{orgId}/accounting/reports/trial-balance', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-income-statement', label: LIT('Income Statement'), path: '/org/{orgId}/accounting/reports/income-statement', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.accounting-balance-sheet', label: LIT('Balance Sheet'), path: '/org/{orgId}/accounting/reports/balance-sheet', permissionKey: 'org.accounting.view' },
          { id: 'nav.org.reports', label: LIT('Reports'), icon: '📈', path: '/org/{orgId}/reports', permissionKey: 'org.reports.view' },
          { id: 'nav.org.accounting-tax', label: LIT('Tax Summary'), path: '/org/{orgId}/accounting/tax-summary', permissionKey: 'org.accounting.view' },
        ],
      },
    ],
  },

  // ── Organisation ──
  {
    id: 'nav.org.domain.organisation',
    label: LIT('Organisation'),
    icon: '🏛️',
    path: '/org/{orgId}/profile',
    children: [
      { id: 'nav.org.profile', label: LIT('Profile & Settings'), icon: '🏛️', path: '/org/{orgId}/profile', permissionKey: 'org.sidebar.profile' },
      { id: 'nav.org.branches', label: LIT('Branches & Resources'), icon: '🏢', path: '/org/{orgId}/branches', permissionKey: 'org.sidebar.branches' },
      { id: 'nav.org.subscription', label: LIT('Subscription'), icon: '📋', path: '/org/{orgId}/subscription', permissionKey: 'org.sidebar.subscription' },
    ],
  },

  // ── Content & Communication ──
  {
    id: 'nav.org.domain.content',
    label: LIT('Content & Comm.'),
    icon: '📢',
    path: '/org/{orgId}/announcements',
    children: [
      { id: 'nav.org.announcements', label: T('org.sidebar.announcements'), icon: '📢', path: '/org/{orgId}/announcements', permissionKey: 'org.sidebar.announcements' },
      { id: 'nav.org.documents', label: T('org.sidebar.documents'), icon: '📄', path: '/org/{orgId}/documents', permissionKey: 'org.sidebar.documents' },
      { id: 'nav.org.gallery', label: T('org.sidebar.gallery'), icon: '🖼️', path: '/org/{orgId}/gallery', permissionKey: 'org.sidebar.gallery' },
      { id: 'nav.org.reviews', label: T('org.sidebar.reviews'), icon: '⭐', path: '/org/{orgId}/reviews', permissionKey: 'org.sidebar.reviews' },
      { id: 'nav.org.verification', label: T('org.sidebar.verification'), icon: '✅', path: '/org/{orgId}/verification', permissionKey: 'org.sidebar.verification' },
    ],
  },
];

const { idToKey, keyToIds } = buildNavIdKeyMaps(ORG_NAV);

export const ORG_ID_TO_KEY: ReadonlyMap<string, string> = idToKey;
export const ORG_LEGACY_KEY_TO_ID: ReadonlyMap<string, string[]> = keyToIds;
