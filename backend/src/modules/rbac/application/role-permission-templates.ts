/**
 * Role → permission matching rules for role template sync.
 * Mirrors backend/scripts/role-permission-templates.mjs (single source of truth).
 * Super Admin is handled separately (all permissions).
 *
 * 26 global template roles (no org clones).
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
  // Identity fields are super-admin-managed: orgs/sellers can view them
  // read-only on their profile screen but never change them.
  'organisations.edit.name',
  'organisations.edit.org-type',
  'organisations.edit.country',
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
  'matches.result.manage',
  'matches.result.rules.manage',
  'matches.admin.view',
];

function isAdminOnlyKey(key: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => key === p || key.startsWith(p));
}

// Academy management is an org-scoped admin capability: org admins manage their
// org/branch academies; master-admin and academy-manager manage platform
// academies. These roles may hold academy.* admin keys despite the generic
// ADMIN_ONLY_PREFIXES deny (players keep only academy.view/enroll/self_enroll).
const ACADEMY_ADMIN_ROLES = new Set(['org-admin', 'master-admin', 'academy-manager']);
function canManageAcademy(templateSlug: string, permissionKey: string): boolean {
  return ACADEMY_ADMIN_ROLES.has(templateSlug)
    && (permissionKey.startsWith('academy.') || permissionKey.startsWith('sidebar.academy'));
}

function matchesAny(key: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(key));
}

// P0-1 (upload authorization hardening): which template roles may upload their
// own content (files.upload) versus which may view/delete arbitrary uploads
// (files.view / files.delete). Super Admin is handled separately (all).
const FILES_UPLOAD_ROLES = new Set([
  'player',
  'coach',
  'independent_coach',
  'resident_coach',
  'org-admin',
  'shop-admin',
  'branch-mgr',
  'resource-mgr',
  'master-admin',
  'court-manager',
  'marketplace-manager',
  'content-manager',
]);

const FILES_VIEW_ROLES = new Set([
  'master-admin',
  'court-manager',
  'marketplace-manager',
  'content-manager',
  'auditor',
  'read-only-admin',
]);

// Delete of arbitrary uploads is restricted to file-management roles (not
// read-only/audit roles).
const FILES_DELETE_ROLES = new Set([
  'master-admin',
  'court-manager',
  'marketplace-manager',
  'content-manager',
]);

// Part 6/7 — org staff (org admin / branch manager / resource manager) may edit,
// replace and finalise saved match scores for matches in their org. Without this,
// the ADMIN_ONLY_PREFIXES block (matches.result.manage) would leave org roles
// unable to review/correct disputed or incorrect scores.
const ORG_RESULT_MANAGE_ROLES = new Set(['org-admin', 'branch-mgr', 'resource-mgr']);
function canManageMatchResults(templateSlug: string, permissionKey: string): boolean {
  return ORG_RESULT_MANAGE_ROLES.has(templateSlug)
    && (permissionKey === 'matches.result.manage' || permissionKey === 'matches.result.rules.manage');
}

// ── Tournament management is an organisation-ADMIN capability (Group 5B UAT) ──
// Genuine organisation-administrator roles (org-admin; master-admin platform
// equivalent) receive the SHARED create-screen field permissions
// (tournaments.create.*) in addition to the org-scoped org.tournaments.* keys
// (already granted via /^org\./). Sellers and operational roles are explicitly
// excluded — the grant is admin-template-scoped, never an indiscriminate
// `tournaments.*` grant to every role.
const TOURNAMENT_ADMIN_ROLES = new Set(['org-admin', 'master-admin']);
function canManageTournaments(templateSlug: string, permissionKey: string): boolean {
  return TOURNAMENT_ADMIN_ROLES.has(templateSlug)
    && (permissionKey === 'tournaments.create' || permissionKey.startsWith('tournaments.create.'));
}

// ── Group 1C — platform Tournament Admin Workbench (master-admin navigation) ──
// master-admin is a genuine platform ADMIN; it must be able to REACH the existing
// Tournament Admin Workbench screens (dashboard / list / matches / bracket-types)
// through the normal sidebar navigation AND pass the existing route guards.
// Only EXISTING Workbench keys are granted — no new keys, no role taxonomy change.
// The singular `tournament.*` family IS the Workbench backend authorization; the
// `sidebar.tournament*` family is the sidebar nav; `admin-tournaments.view` is the
// page-level gate used by every Workbench screen; `tournaments.edit/delete` are the
// list/detail action buttons on those same screens.
const TOURNAMENT_WORKBENCH_KEYS = new Set([
  'sidebar.tournament',
  'sidebar.tournament-dashboard',
  'sidebar.tournament-list',
  'sidebar.tournament-matches',
  'admin-tournaments.view',
  'tournament.bracket-types.view',
  'tournament.bracket-types.manage',
  'tournament.view',
  'tournament.dashboard.view',
  'tournament.create',
  'tournament.update',
  'tournament.publish',
  'tournament.delete',
  'tournament.register',
  'tournament.manage',
  'tournament.result.manage',
  'tournaments.edit',
  'tournaments.delete',
]);
function canAccessTournamentWorkbench(templateSlug: string, permissionKey: string): boolean {
  return templateSlug === 'master-admin' && TOURNAMENT_WORKBENCH_KEYS.has(permissionKey);
}

// Seller/shop-admin roles must NEVER receive tournament administration — the
// tournament capability is organisation-ADMIN only. Explicit deny (defense in
// depth): even if SHOP_ADMIN_PATTERNS were later broadened, sellers stay out.
const SHOP_ADMIN_DENY_TOURNAMENT_KEYS = new Set([
  'org.sidebar.tournaments',
  'org.tournaments.view',
  'org.tournaments.create',
  'org.tournaments.update',
  'org.tournaments.publish',
  'org.tournaments.delete',
  'org.tournaments.manage',
  'org.tournaments.register',
  'org.tournaments.result.manage',
]);
function isSellerDeniedTournamentKey(permissionKey: string): boolean {
  return permissionKey === 'tournaments.create'
    || permissionKey.startsWith('tournaments.create.')
    || SHOP_ADMIN_DENY_TOURNAMENT_KEYS.has(permissionKey);
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
  // Service-location selection is a coach-side decision (explicit branch
  // opt-in). Players must never hold the manage permission.
  'coaches.service_locations.manage',
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
  'branches.edit.coach-policy',
  'organisations.edit.cancellation',
  'community.chat.view',
  'community.chat.send',
  'coaches.reviews.create',
  'coaches.approve',
  'coaches.assign',
  'settlements.view',
  'settlements.request',
  'settlements.pay',
  'settlements.cancel',
  'academies.enroll',
]);

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

// Organisation and shop-admin roles must NOT hold CourtZon platform-level
// financial approval authority. marketplace.complaints.approve controls the
// /admin/marketplace/complaints/*/approve path which executes CourtZon-level
// refund approval for over-threshold complaints (refund > 125% of disputed
// value). Org/shop admins already resolve complaints via
// marketplace.complaints.manage; granting approve would let an org/shop self-
// approve its own over-threshold refunds without CourtZon oversight.
const ORG_SHOP_ADMIN_DENY_KEYS = new Set([
  'marketplace.complaints.approve',
]);

const COACH_PATTERNS = [
  /^coaches\.(profile|sessions|availability|service_locations|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^academy\.coach\./,
  /^profile\./,
  /^bookings\.(view|create|cancel)/,
  /^community\.chat\./,
  /^organisations\.storefront\.view$/,
  /^marketplace\.(view|cart|order|wishlist|addresses)/,
];

const INDEPENDENT_COACH_PATTERNS = [
  /^coaches\.(profile|sessions|availability|service_locations|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^academy\.coach\./,
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
  /^coaches\.(profile|sessions|availability|service_locations|invites|book|reviews|view|apply|manage_profile|manage_agreements|create_sessions|complete_session|confirm_session|no_show|respond_request|start_session)/,
  /^coaches\.book\./,
  /^coaches\.profile\.edit\./,
  /^coach\.revenue\./,
  /^coach\.attendance\./,
  /^coach\.statistics\./,
  /^academy\.coach\./,
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
  /^matches\./,
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
  // Operational settlement responsibilities: view + request eligible
  // settlements. Marketplace approval/payout remains finance-only (mirrors
  // operations-manager; see role-permission-templates.mjs).
  /^settlements\.(view|request)$/,
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
  /^sidebar\.(dashboard|reports|settlements|admin-bookings|finance-dashboard|finance-ledger|finance-reports|finance-transactions|withdrawal-requests|coupons|marketplace-orders)$/,
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
];

const READ_ONLY_ADMIN_PATTERNS = [
  /^.+\.view/,
  /^dashboard\./,
  /^reports\./,
  /^profile\./,
  /^home\./,
  /^sidebar\./,
  /^notifications\.view/,
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
  // AdminLayout finance sidebar (leaf items only; parents render when a child passes)
  /^sidebar\.(dashboard|reports|settlements|admin-bookings|finance-dashboard|finance-ledger|finance-reports|finance-transactions|withdrawal-requests|coupons|marketplace-orders)$/,
];

const BRANCH_MGR_PATTERNS = [
  /^branches\./,
  /^resources\./,
  /^org\.(sidebar\.(branches|resources|matches|match-results)|branches\.manage|resources\.manage|matches\.view|matches\.results\.view)/,
  /^bookings\./,
  /^profile\./,
  /^organisations\.storefront\./,
  /^organisations\.edit\.resources$/,
  /^community\.chat\./,
];

const RESOURCE_MGR_PATTERNS = [
  /^resources\./,
  /^org\.(sidebar\.(resources|matches|match-results)|resources\.manage|matches\.view|matches\.results\.view)/,
  /^bookings\./,
  /^profile\./,
  /^organisations\.storefront\./,
  /^organisations\.edit\.resources$/,
  /^community\.chat\./,
];

export function permissionMatchesTemplate(templateSlug: string, permissionKey: string): boolean {
  if (templateSlug === 'super_admin') return true;

  // P0-1 (upload authorization hardening): server-side file permissions.
  //   files.upload  → roles that legitimately upload their own content
  //                   (players: product images/avatar; coaches: certs; orgs:
  //                   shop/org images; managers: platform content).
  //   files.view    → file-administration roles (view/uploads listing).
  //   files.delete  → file-administration roles only (delete arbitrary uploads).
  if (permissionKey.startsWith('files.')) {
    if (permissionKey === 'files.upload') return FILES_UPLOAD_ROLES.has(templateSlug);
    if (permissionKey === 'files.view') return FILES_VIEW_ROLES.has(templateSlug);
    if (permissionKey === 'files.delete') return FILES_DELETE_ROLES.has(templateSlug);
    return false;
  }

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
    if (canManageAcademy(templateSlug, permissionKey)) return true;
    if (canManageMatchResults(templateSlug, permissionKey)) return true;
    if (canManageTournaments(templateSlug, permissionKey)) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (permissionKey.startsWith('marketplace.admin.')) return false;
    if (ORG_SHOP_ADMIN_DENY_KEYS.has(permissionKey)) return false;
    if (ORG_ADMIN_EXPLICIT_KEYS.has(permissionKey)) return true;
    return matchesAny(permissionKey, ORG_ADMIN_PATTERNS);
  }

  if (templateSlug === 'branch-mgr') {
    if (canManageMatchResults(templateSlug, permissionKey)) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, BRANCH_MGR_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'resource-mgr') {
    if (canManageMatchResults(templateSlug, permissionKey)) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, RESOURCE_MGR_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'shop-admin') {
    // Seller/shop-admin roles must NEVER receive tournament administration —
    // explicit deny (org-ADMIN-only capability; defense-in-depth).
    if (isSellerDeniedTournamentKey(permissionKey)) return false;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (permissionKey.startsWith('marketplace.admin.')) return false;
    if (ORG_SHOP_ADMIN_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, SHOP_ADMIN_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'coach') {
    if (permissionKey.startsWith('academy.coach.')) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'independent_coach') {
    if (permissionKey.startsWith('academy.coach.')) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, INDEPENDENT_COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'resident_coach') {
    if (permissionKey.startsWith('academy.coach.')) return true;
    if (isAdminOnlyKey(permissionKey)) return false;
    if (COACH_DENY_KEYS.has(permissionKey)) return false;
    if (matchesAny(permissionKey, RESIDENT_COACH_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'accountant') {
    if (permissionKey.startsWith('users.delete')) return false;
    if (permissionKey.startsWith('roles.')) return false;
    if (matchesAny(permissionKey, ACCOUNTANT_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'referee') {
    if (isAdminOnlyKey(permissionKey)) return false;
    if (matchesAny(permissionKey, REFEREE_PATTERNS)) return true;
    return false;
  }

  if (templateSlug === 'master-admin') {
    if (canManageAcademy(templateSlug, permissionKey)) return true;
    // Explicitly granted platform capabilities hidden behind ADMIN_ONLY_PREFIXES.
    // Match-Result admin lets master-admin resolve disputes / mark no-result /
    // correct results. Players/org roles never receive these (ADMIN_ONLY block).
    if (permissionKey === 'matches.result.manage' || permissionKey === 'matches.result.rules.manage') return true;
    // Platform-wide match monitoring (list all matches) — granted only to
    // platform admins; blocked for player/org roles via ADMIN_ONLY_PREFIXES.
    if (permissionKey === 'matches.admin.view') return true;
    // Group 5B UAT — master-admin is a genuine ADMIN role that manages org
    // tournaments; it receives the shared create-screen field permissions.
    if (canManageTournaments(templateSlug, permissionKey)) return true;
    // Group 1C — master-admin reaches the existing Tournament Admin Workbench
    // through normal navigation (sidebar keys) and passes its route guards
    // (tournament.* + admin-tournaments.view). Explicit grant BEFORE the
    // admin-only block, mirroring matches.result.manage / canManageTournaments.
    if (canAccessTournamentWorkbench(templateSlug, permissionKey)) return true;
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
    if (canManageAcademy(templateSlug, permissionKey)) return true;
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
