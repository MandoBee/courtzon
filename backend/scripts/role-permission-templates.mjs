/**
 * Role → permission matching rules for sync-role-permissions.mjs
 * Super Admin is handled separately (all permissions).
 *
 * Only 8 global template roles exist (no org clones).
 */

const ADMIN_ONLY_PREFIXES = [
  'users.',
  'roles.',
  'permissions.',
  'ui-permissions.',
  'organisations.view',
  'organisations.create',
  'organisations.delete',
  'organisations.verify',
  'organisation-types.',
  'subscription.',
  'cms.',
  'audit.',
  'marketplace.admin.',
  'admin.',
  'platform.',
  'feature-flags.',
  'app-settings.',
  'design-tokens.',
  'appearance.',
  'translations.',
  'translation-keys.',
  'reports.',
  'countries.',
  'currencies.',
  'banks.',
  'brands.',
  'tags.',
  'sport-categories.',
  'settings.',
  'sidebar.layout.manage',
  'security.',
  'monitoring.',
  'scheduled-jobs.',
  'contact-submissions.',
  'approvals.',
  'commission-rules.',
  'payment-methods.',
  'payment-gateways.',
  'resource-types.',
  'sports.edit',
  'sports.create',
  'sports.delete',
  'amenities.',
  'coupons.admin',
  'settlements.admin',
  'notifications.',
];

function isAdminOnlyKey(key) {
  return ADMIN_ONLY_PREFIXES.some((p) => key === p || key.startsWith(p));
}

function matchesAny(key, patterns) {
  return patterns.some((re) => re.test(key));
}

const PLAYER_PATTERNS = [
  /^home\./,
  /^profile\./,
  /^bookings\.(view|create|cancel|apply|manage-applicants)/,
  /^bookings\.create\./,
  /^marketplace\.(view|cart|order|wishlist)/,
  /^marketplace\.sell$/,
  /^coaches\./,
  /^academies\.(view|enroll)/,
  /^tournaments\.view/,
  /^community\./,
  /^branches\.(request-access|view)/,
  /^organisations\.storefront\./,
  /^wallet\./,
  /^financial\.wallet\./,
  /^financial\.withdraw$/,
  /^matches\./,
  /^notifications\.view$/,
  /^sports\.view$/,
];

const ORG_ADMIN_PATTERNS = [
  /^org\./,
  /^organisations\.edit\./,
  /^organisations\.edit$/,
  /^branches\./,
  /^resources\./,
  /^bookings\./,
  /^marketplace\.(?!admin)/,
  /^community\.chat\./,
  /^profile\./,
  /^organisations\.storefront\./,
  /^coaches\.reviews\.create$/,
  /^academies\.enroll$/,
];

const SHOP_ADMIN_PATTERNS = [
  /^marketplace\./,
  /^org\.(sidebar\.(dashboard|marketplace|orders|staff|settings|resources)|dashboard\.view|marketplace\.manage|settings\.edit|staff\.manage|resources\.manage)/,
  /^org\.settings\.shipping-rates-tab$/,
  /^resources\./,
  /^profile\./,
  /^organisations\.edit\.(name|description|logo|cover|email|phone|website|slug|country)/,
  /^organisations\.edit\.(basic|branches|resources)/,
  /^branches\.edit\.(basic|name|email|phone|address|status)/,
  /^branches\.edit$/,
  /^branches\.view$/,
  /^bookings\.create\.resource$/,
];

const COACH_DENY_KEYS = new Set([
  'coaches.verify',
  'coaches.toggle',
  'coaches.delete',
  'coaches.approve',
  'coaches.assign',
]);

const COACH_PATTERNS = [
  /^coaches\.(profile|sessions|availability|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^profile\./,
  /^bookings\.(view|create|cancel)/,
  /^community\.chat\./,
  /^organisations\.storefront\.view$/,
  /^marketplace\.view$/,
];

const ACCOUNTANT_PATTERNS = [
  /^financial\./,
  /^reports\./,
  /^dashboard\.(view|stats|trends)/,
  /^bookings\.view$/,
  /^admin\.bookings\.view$/,
  /^marketplace\.admin\.orders/,
  /^settlements\./,
  /^coupons\./,
  /^commission-rules\./,
  /^wallet\./,
];

const BRANCH_MGR_PATTERNS = [
  /^branches\./,
  /^resources\./,
  /^org\.(sidebar\.(branches|resources)|branches\.manage|resources\.manage)/,
  /^bookings\./,
  /^profile\./,
  /^organisations\.storefront\./,
  /^organisations\.edit\.resources$/,
  /^community\.chat\./,
];

const RESOURCE_MGR_PATTERNS = [
  /^resources\./,
  /^org\.(sidebar\.resources|resources\.manage)/,
  /^bookings\./,
  /^profile\./,
  /^organisations\.storefront\./,
  /^organisations\.edit\.resources$/,
  /^community\.chat\./,
];

const ORG_ADMIN_EXPLICIT_KEYS = new Set([
  'org.staff.manage',
  'org.members.manage',
  'org.coaches.manage',
  'org.bookings.manage',
  'org.branches.manage',
  'org.resources.manage',
  'org.marketplace.manage',
  'org.settings.edit',
  'organisations.edit.branches',
  'organisations.edit.cancellation',
  'community.chat.view',
  'community.chat.send',
  'coaches.reviews.create',
  'academies.enroll',
]);

export function permissionMatchesTemplate(templateSlug, permissionKey) {
  if (templateSlug === 'super_admin') return true;

  if (templateSlug === 'player') {
    if (permissionKey === 'home.recent-activity') return false;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (permissionKey.startsWith('org.')) return false;
    if (matchesAny(permissionKey, PLAYER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'org-admin') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (permissionKey.startsWith('marketplace.admin.')) return false;
    if (ORG_ADMIN_EXPLICIT_KEYS.has(permissionKey)) return true;
    return matchesAny(permissionKey, ORG_ADMIN_PATTERNS);
  }

  if (templateSlug === 'branch-mgr') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, BRANCH_MGR_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'resource-mgr') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, RESOURCE_MGR_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'shop-admin') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (permissionKey.startsWith('marketplace.admin.')) return false;
    if (matchesAny(permissionKey, SHOP_ADMIN_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'coach') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'accountant') {
    if (permissionKey.startsWith('users.delete')) return false;
    if (permissionKey.startsWith('roles.')) return false;
    if (matchesAny(permissionKey, ACCOUNTANT_PATTERNS)) return true;
    return false;
  }

  return false;
}

export const TEMPLATE_SLUGS = [
  'super_admin',
  'player',
  'org-admin',
  'branch-mgr',
  'resource-mgr',
  'shop-admin',
  'coach',
  'accountant',
];
