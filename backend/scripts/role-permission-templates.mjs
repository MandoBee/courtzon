/**
 * Role → permission matching rules for sync-role-permissions.mjs
 * Super Admin is handled separately (all permissions).
 *
 * 10 global template roles (no org clones).
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
  'support.',
  'coupons.admin',
  'settlements.admin',
  'notifications.',
  'academy.',
  'tournament.',
  'season.',
  'league.',
  'inventory.',
  'accounting.',
  'crm.',
  'hr.',
  'bi.',
  'sports-engine.',
  'integration.',
  'mobile.',
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
  /^bookings\.(view|create|cancel|apply|manage-applicants|matchmaking)/,
  /^bookings\.create\./,
  /^marketplace\.(view|cart|order|wishlist|addresses|complaints\.(submit|view))$/,
  /^marketplace\.sell$/,
  /^marketplace\.player\.status$/,
  /^coaches\./,
  /^academies\.(view|enroll)/,
  /^academy\.(view|enroll)/,
  /^tournament\.view$/,
  /^player\.(dashboard|search|profile|favorites|statistics|achievements|qr|devices)\./,
  /^player\.tournaments\.register/,
  /^tournaments\.view/,
  /^community\./,
  /^branches\.(request-access|view)/,
  /^organisations\.storefront\./,
  /^wallet\./,
  /^financial\.wallet\./,
  /^financial\.payment\./,
  /^financial\.withdraw$/,
  /^matches\./,
  /^notifications\.view$/,
  /^sports\.view$/,
  /^player\./,
  /^academy\.self_enroll/,
  /^league\.self_register/,
  /^player\.tournaments\.register/,
];

// Player-facing keys whose `academy.`/`tournament.`/`league.` prefixes are
// admin-only by default but are required for public/self-service endpoints.
const PLAYER_EXPLICIT_KEYS = new Set([
  'academy.view',
  'academy.enroll',
  'academy.self_enroll',
  'tournament.view',
  'tournament.register',
  'league.self_register',
]);

// Coach-side session lifecycle actions that must NOT leak to players via the
// broad /^coaches\./ pattern. These are coach-side session management verbs.
const PLAYER_DENY_KEYS = new Set([
  'coaches.complete_session',
  'coaches.confirm_session',
  'coaches.no_show',
  'coaches.respond_request',
  'coaches.start_session',
]);

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
  /^membership\./,
];

const SHOP_ADMIN_PATTERNS = [
  /^marketplace\./,
  /^org\.sidebar\.(dashboard|marketplace|orders|settings|staff|accounting|finance|profile|branches|subscription)$/,
  /^org\.(dashboard\.view|marketplace\.manage|settings\.edit|settings\.shipping-rates-tab|staff\.manage|profile\.view|branches\.view|branches\.manage|subscription\.(view|promote|renew|pay)|finance\.view|reports\.view)$/,
  /^org\.accounting\.(view|manage|journal\.view|journal\.create)$/,
  /^settlements\.request$/,
  /^profile\./,
  /^organisations\.edit\.(name|description|logo|cover|email|phone|website|slug|country)/,
  /^organisations\.edit\.(basic|branches)/,
  /^branches\.edit\.(basic|financial|name|email|phone|address|status)/,
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
  /^coaches\.(profile|sessions|availability|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^profile\./,
  /^bookings\.(view|create|cancel)/,
  /^community\.chat\./,
  /^organisations\.storefront\.view$/,
  /^marketplace\.(view|cart|order|wishlist|addresses)/,
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
  // Organisation-scoped accounting (assigned via org portal)
  /^org\.accounting\./,
  /^org\.sidebar\.accounting/,
  // AdminLayout finance sidebar (leaf items only; parents render when a child passes)
  /^sidebar\.(dashboard|reports|settlements|admin-bookings|finance-dashboard|finance-ledger|finance-reports|finance-transactions|withdrawal-requests|coupons|marketplace-orders)$/,
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
  'coaches.approve',
  'coaches.assign',
  'settlements.view',
  'settlements.request',
  'academies.enroll',
]);

const INDEPENDENT_COACH_PATTERNS = [
  /^coaches\.(profile|sessions|availability|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^profile\./,
  /^bookings\.(view|create|cancel)/,
  /^community\.chat\./,
  /^organisations\.storefront\.view$/,
  /^marketplace\.(view|cart|order|wishlist)/,
  /^marketplace\.sell$/,
  /^home\./,
  /^wallet\./,
  /^financial\.wallet\./,
  /^financial\.payment\./,
  /^financial\.withdraw$/,
  /^matches\./,
  /^notifications\.view$/,
  /^sports\.view$/,
  /^tournaments\.view/,
  /^academies\.(view|enroll)/,
];

const RESIDENT_COACH_PATTERNS = [
  /^coaches\.(profile|sessions|availability|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^profile\./,
  /^bookings\.(view|create|cancel)/,
  /^community\.chat\./,
  /^organisations\.storefront\.view$/,
  /^marketplace\.view$/,
];

/** Official Referee role: officiating scope only (own profile, assignments, availability, results). */
const REFEREE_PATTERNS = [
  /^referee\./,
];

const MASTER_ADMIN_PATTERNS = [
  /^org\./,
  /^organisations\./,
  /^branches\./,
  /^resources\./,
  /^bookings\./,
  /^marketplace\./,
  /^financial\./,
  /^reports\./,
  /^tournament\./,
  /^academy\./,
  /^league\./,
  /^community\./,
  /^coaches\./,
  /^profile\./,
  /^home\./,
  /^dashboard\./,
  /^membership\./,
  /^support\./,
  /^notifications\.view/,
];

const COURT_MANAGER_PATTERNS = [
  /^resources\./,
  /^branches\./,
  /^bookings\./,
  /^org\.(sidebar\.(resources|branches|bookings)|resources\.manage|branches\.manage)/,
  /^profile\./,
  /^organisations\.storefront\./,
];

const MARKETPLACE_MANAGER_PATTERNS = [
  /^marketplace\./,
  /^org\.sidebar\.marketplace/,
  /^org\.marketplace\.manage/,
  /^settlements\./,
  /^financial\.settlements/,
  /^organisations\.view/,
  /^profile\./,
  /^sidebar\.(marketplace|orders|settlements)/,
  /^bookings\.view/,
];

const RECEPTIONIST_PATTERNS = [
  /^bookings\.(view|create|cancel|check-in)/,
  /^bookings\.create\./,
  /^resources\.view/,
  /^branches\.view/,
  /^player\.dashboard\.view/,
  /^player\.profile\.view/,
  /^player\.search\./,
  /^organisations\.storefront\.view/,
  /^profile\./,
  /^sidebar\.bookings/,
  /^notifications\.view/,
];

const CUSTOMER_SERVICE_PATTERNS = [
  /^support\./,
  /^player\.(dashboard\.view|profile\.view|search)/,
  /^bookings\./,
  /^marketplace\.admin\.orders\.view/,
  /^marketplace\.admin\.orders\.moderate/,
  /^marketplace\.complaints\.approve$/,
  /^organisations\.view/,
  /^profile\./,
  /^notifications\.view/,
  /^sidebar\.(support|players|bookings|orders)/,
];

const FINANCE_MANAGER_PATTERNS = [
  /^financial\./,
  /^reports\./,
  /^settlements\./,
  /^coupons\./,
  /^accounting\./,
  /^wallet\./,
  /^dashboard\.(view|stats|trends)/,
  /^bookings\.view/,
  /^admin\.bookings\.view/,
  /^marketplace\.admin\.orders/,
  /^sidebar\.(dashboard|reports|settlements|admin-bookings|finance-dashboard|finance-ledger|finance-reports|finance-transactions|withdrawal-requests|coupons|marketplace-orders)/,
];

const OPERATIONS_MANAGER_PATTERNS = [
  /^org\./,
  /^organisations\.edit\./,
  /^organisations\.edit$/,
  /^branches\./,
  /^resources\./,
  /^bookings\./,
  /^org\.(sidebar\.(staff|members|coaches)|staff\.manage|members\.manage|coaches\.manage|branches\.manage|resources\.manage)/,
  /^profile\./,
  /^organisations\.storefront\./,
  // Operational settlement responsibilities: view + request + settle eligible
  // bookings / collect recoveries. Marketplace approval/payout remains finance-only.
  /^settlements\.(view|request)$/,
];

const TOURNAMENT_MANAGER_PATTERNS = [
  /^tournament\./,
  /^tournaments\./,
  /^league\./,
  /^season\./,
  /^sidebar\.(tournaments|leagues|seasons)/,
  /^profile\./,
  /^bookings\.view/,
  /^resources\.view/,
  /^referee\./,
];

const ACADEMY_MANAGER_PATTERNS = [
  /^academy\./,
  /^academies\./,
  /^sidebar\.(academy|academies)/,
  /^profile\./,
  /^coaches\.(view|assign)/,
  /^bookings\.view/,
  /^resources\.view/,
];

const EVENT_MANAGER_PATTERNS = [
  /^community\./,
  /^sidebar\.(community|events)/,
  /^profile\./,
  /^bookings\.view/,
  /^notifications\.view/,
  /^notifications\.send/,
  /^dashboard\.view/,
];

const MARKETING_MANAGER_PATTERNS = [
  /^ads\./,
  /^community\./,
  /^cms\./,
  /^notifications\./,
  /^sidebar\.(ads|community|notifications|cms)/,
  /^profile\./,
  /^reports\.view/,
];

const CONTENT_MANAGER_PATTERNS = [
  /^cms\./,
  /^translations\./,
  /^design-tokens\./,
  /^sidebar\.(cms|translations|design-tokens)/,
  /^profile\./,
  /^dashboard\.view/,
];

const SUPPORT_AGENT_PATTERNS = [
  /^support\./,
  /^player\.(dashboard\.view|profile\.view)/,
  /^bookings\.view/,
  /^notifications\.view/,
  /^profile\./,
  /^sidebar\.support/,
  /^marketplace\.admin\.orders\.view/,
];

const AUDITOR_PATTERNS = [
  /^.+\.view/,
  /^bookings\.view/,
  /^bookings\.view\./,
  /^organisations\.view/,
  /^organisations\.view\./,
  /^dashboard\./,
  /^reports\./,
  /^profile\./,
  /^home\./,
  /^sidebar\./,
  /^notifications\.view/,
  // Read-only Finance navigation (view-only capabilities already granted above)
  /^org\.sidebar\.finance/,
  /^org\.sidebar\.accounting/,
];

const READ_ONLY_ADMIN_PATTERNS = [
  /^.+\.view/,
  /^dashboard\./,
  /^reports\./,
  /^profile\./,
  /^home\./,
  /^sidebar\./,
  /^notifications\.view/,
  // Read-only Finance navigation (view-only capabilities already granted above)
  /^org\.sidebar\.finance/,
  /^org\.sidebar\.accounting/,
];

export function permissionMatchesTemplate(templateSlug, permissionKey) {
  if (templateSlug === 'super_admin') return true;

  if (templateSlug === 'player') {
    if (permissionKey === 'home.recent-activity') return false;
    if (PLAYER_EXPLICIT_KEYS.has(permissionKey)) return true;
    if (PLAYER_DENY_KEYS.has(permissionKey)) return false;
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

  if (templateSlug === 'independent_coach') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, INDEPENDENT_COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'resident_coach') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, RESIDENT_COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'referee') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, REFEREE_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'accountant') {
    if (permissionKey.startsWith('users.delete')) return false;
    if (permissionKey.startsWith('roles.')) return false;
    if (matchesAny(permissionKey, ACCOUNTANT_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'master-admin') {
    if (permissionKey.startsWith('users.')) return false;
    if (permissionKey.startsWith('roles.')) return false;
    if (permissionKey.startsWith('permissions.')) return false;
    if (permissionKey.startsWith('ui-permissions.')) return false;
    if (permissionKey.startsWith('platform.')) return false;
    if (permissionKey.startsWith('feature-flags.')) return false;
    if (permissionKey.startsWith('app-settings.')) return false;
    if (permissionKey === 'sidebar.admin' || permissionKey === 'admin.') return false;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, MASTER_ADMIN_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'court-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, COURT_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'marketplace-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, MARKETPLACE_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'receptionist') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, RECEPTIONIST_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'customer-service') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, CUSTOMER_SERVICE_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'finance-manager') {
    if (permissionKey.startsWith('users.delete')) return false;
    if (permissionKey.startsWith('roles.')) return false;
    if (matchesAny(permissionKey, FINANCE_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'operations-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, OPERATIONS_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'tournament-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, TOURNAMENT_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'academy-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, ACADEMY_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'event-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, EVENT_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'marketing-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, MARKETING_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'content-manager') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, CONTENT_MANAGER_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'support-agent') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, SUPPORT_AGENT_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'auditor') {
    if (permissionKey.startsWith('roles.')) return false;
    if (permissionKey.startsWith('permissions.')) return false;
    if (matchesAny(permissionKey, AUDITOR_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'read-only-admin') {
    if (permissionKey.startsWith('roles.')) return false;
    if (permissionKey.startsWith('permissions.')) return false;
    if (permissionKey.includes('.delete')) return false;
    if (permissionKey.includes('.create')) return false;
    if (permissionKey.includes('.edit')) return false;
    if (permissionKey.includes('.manage')) return false;
    if (permissionKey.includes('.approve')) return false;
    if (permissionKey.includes('.reject')) return false;
    if (permissionKey.includes('.cancel')) return false;
    if (permissionKey.includes('.publish')) return false;
    if (matchesAny(permissionKey, READ_ONLY_ADMIN_PATTERNS)) return true;
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
  'independent_coach',
  'resident_coach',
  'referee',
  'accountant',
  'master-admin',
  'court-manager',
  'marketplace-manager',
  'receptionist',
  'customer-service',
  'finance-manager',
  'operations-manager',
  'tournament-manager',
  'academy-manager',
  'event-manager',
  'marketing-manager',
  'content-manager',
  'support-agent',
  'auditor',
  'read-only-admin',
];
