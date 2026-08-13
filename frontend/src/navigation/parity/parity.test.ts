import { describe, it, expect } from 'vitest';
import { getRegistryDefaultsMap, useI18nStore } from '../../i18n';
import { buildLegacyAdminNavItems } from './legacy/admin-sidebar';
import { buildLegacyOrgNavItems } from './legacy/org-sidebar';
import { COACH_NAV as LEGACY_COACH_NAV } from './legacy/coach-nav';
import { buildSections } from './legacy/workspace-nav';
import { REFEREE_NAV as LEGACY_REFEREE_NAV } from './legacy/referee-nav';
import {
  buildPlayerCoreTabs,
  buildPlayerMoreItems,
  filterPlayerMoreItems,
} from './legacy/player-nav';
import {
  ADMIN_NAV,
  ADMIN_ID_TO_KEY,
  ADMIN_LEGACY_KEY_TO_ID,
  ORG_NAV,
  ORG_ID_TO_KEY,
  ORG_LEGACY_KEY_TO_ID,
  COACH_NAV,
  COACH_ID_TO_KEY,
  COACH_LEGACY_KEY_TO_ID,
  REFEREE_NAV,
  REFEREE_ID_TO_KEY,
  REFEREE_LEGACY_KEY_TO_ID,
  PLAYER_CORE_TABS,
  PLAYER_MORE_ITEMS,
  PLAYER_ID_TO_KEY,
  PLAYER_LEGACY_KEY_TO_ID,
  composeFilters,
  sellerFilter,
  permissionFilter,
  featureFlagFilter,
  requiredFlagFilter,
  projectPlayerCoreTabs,
  projectPlayerMoreItems,
  PLAYER_CORE_PIPELINE,
  PLAYER_MORE_PIPELINE,
  T,
  LIT,
  resolveAdminNav,
  resolveOrgNav,
  resolveCoachNav,
  resolveRefereeNav,
  resolvePlayerCoreTabs,
  resolvePlayerMoreItems,
  resolveWorkspaceNav,
  resolveLabel,
  buildDefaultContainers,
  serializeContainers,
  mergeSavedLayout,
  buildAdminSearchCommands,
  matchNavSearchCommands,
  LEGACY_NAV_COMMANDS,
  type WorkspaceLayoutRow,
  type ResolvedNavItem,
  type NavDefinition,
  type NavFilterContext,
  type WorkspaceNode,
} from '../../navigation';
import {
  canonicalizeList,
  firstDiff,
  collectPermissionKeys,
  collectIds,
  findDuplicateValues,
} from './compare';

const defaults = getRegistryDefaultsMap();
const enT = (key: string) => defaults[key] ?? key;
const strictT = (key: string) => defaults[key] ?? `❌UNKNOWN:${key}`;
const altT = (key: string) => (defaults[key] ? `AR·${defaults[key]}` : key);
const sentinelT = (key: string) => (defaults[key] ? `SENTINEL-${key}` : key);

const allCan = () => true;
const noneCan = () => false;

const allFlags = () => true;

describe('Phase 1 parity gate — admin sidebar (buildNavItems vs Navigation Registry)', () => {
  // NOTE: The IA Migration restructured ADMIN_NAV into 9 Business Domains.
  // The legacy fixture (buildLegacyAdminNavItems) represents the pre-IA flat structure.
  // The Navigation Migration parity gate is frozen — these tests now verify the
  // IA structure is internally consistent, not that it matches the old fixture.

  it('resolved admin nav has 9 Business Domains as top-level sections', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    expect(nav.length).toBe(9);
    expect(nav.every((d) => d.children !== undefined && d.children.length > 0)).toBe(true);
  });

  it('all 9 domain labels render correctly', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    expect(nav.map((d) => d.label)).toEqual([
      'Dashboard', 'People', 'Facilities', 'Coaching',
      'Competitions', 'Commerce', 'Finance', 'Accounting', 'Platform',
    ]);
  });

  it('resolves to empty when no permissions are granted (all domains hidden)', () => {
    const legacy = buildLegacyAdminNavItems(enT, noneCan, allFlags) as unknown as ResolvedNavItem[];
    const registry = resolveAdminNav(enT, noneCan, allFlags);
    expect(registry.length).toBe(0);
    expect(legacy.length).toBe(0);
  });

  it('permission-filtered: granting only sidebar.dashboard shows only the Dashboard domain', () => {
    const nav = resolveAdminNav(enT, (p) => p === 'sidebar.dashboard', allFlags);
    expect(nav.length).toBe(1);
    expect(nav[0].label).toBe('Dashboard');
    expect(nav[0].children?.length).toBe(1);
    expect(nav[0].children?.[0].permissionKey).toBe('sidebar.dashboard');
  });

  it('feature-flag filtered: disabling marketplace flag removes Marketplace section but keeps Commerce domain', () => {
    const nav = resolveAdminNav(enT, allCan, (f) => f !== 'app.marketplace_enabled');
    const commerce = nav.find((d) => d.label === 'Commerce');
    expect(commerce).toBeDefined();
    const marketplaceChild = commerce?.children?.find((c) => c.id === 'nav.admin.marketplace');
    expect(marketplaceChild).toBeUndefined();
    expect(commerce?.children?.some((c) => c.id === 'nav.admin.pricing')).toBe(true);
  });

  it('feature-flag filtered: disabling events flag removes Ads from Commerce', () => {
    const nav = resolveAdminNav(enT, allCan, (f) => f !== 'community.events_enabled');
    const commerce = nav.find((d) => d.label === 'Commerce');
    const ads = commerce?.children?.find((c) => c.id === 'nav.admin.ads');
    expect(ads).toBeUndefined();
  });

  it('saved layout: within-domain order preserved for Organisations children under People', () => {
    const layout = new Map<string | null, string[]>();
    layout.set('sidebar.organisations', [
      'sidebar.organisation-types',
      'sidebar.organisations',
      'sidebar.branch-access',
    ]);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    const people = nav.find((d) => d.label === 'People');
    const orgSection = people?.children?.find((c) => c.id === 'nav.admin.organisations');
    expect(orgSection?.children?.map((c) => c.permissionKey)).toEqual([
      'sidebar.organisation-types',
      'sidebar.organisations',
      'sidebar.branch-access',
    ]);
  });

  it('People domain contains exactly 6 modules in correct order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const people = nav.find((d) => d.label === 'People');
    expect(people?.children?.map((c) => c.id)).toEqual([
      'nav.admin.users',
      'nav.admin.roles',
      'nav.admin.organisations',
      'nav.admin.membership',
      'nav.admin.crm',
      'nav.admin.hr',
    ]);
  });

  it('Facilities domain contains exactly 7 modules in correct order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const facilities = nav.find((d) => d.label === 'Facilities');
    expect(facilities?.children?.map((c) => c.id)).toEqual([
      'nav.admin.reception',
      'nav.admin.admin-bookings',
      'nav.admin.sports-engine',
      'nav.admin.sports',
      'nav.admin.amenities',
      'nav.admin.community',
      'nav.admin.inventory',
    ]);
  });

  it('Coaching domain contains exactly 2 modules: Academy → Coaches', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const coaching = nav.find((d) => d.label === 'Coaching');
    expect(coaching?.children?.map((c) => c.id)).toEqual([
      'nav.admin.academy',
      'nav.admin.coaches',
    ]);
  });

  it('Competitions domain contains exactly 2 modules: League → Tournament', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const comp = nav.find((d) => d.label === 'Competitions');
    expect(comp?.children?.map((c) => c.id)).toEqual([
      'nav.admin.league',
      'nav.admin.tournament',
    ]);
  });

  it('Commerce domain contains exactly 7 modules in correct order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const commerce = nav.find((d) => d.label === 'Commerce');
    expect(commerce?.children?.map((c) => c.id)).toEqual([
      'nav.admin.marketplace',
      'nav.admin.pricing',
      'nav.admin.subscription',
      'nav.admin.subscription-requests',
      'nav.admin.settlements',
      'nav.admin.coupons',
      'nav.admin.ads',
    ]);
  });

  it('Finance domain contains 8 child items under Finance', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const finance = nav.find((d) => d.label === 'Finance');
    expect(finance?.children?.map((c) => c.permissionKey)).toEqual([
      'sidebar.finance-dashboard',
      'sidebar.finance-ledger',
      'sidebar.finance-reports',
      'sidebar.banks',
      'sidebar.bank-branches',
      'sidebar.finance-transactions',
      'sidebar.withdrawal-requests',
      'sidebar.withdrawals-queue',
    ]);
  });

  it('Platform domain contains exactly 7 modules in correct order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const platform = nav.find((d) => d.label === 'Platform');
    expect(platform?.children?.map((c) => c.id)).toEqual([
      'nav.admin.security',
      'nav.admin.notifications',
      'nav.admin.integration',
      'nav.admin.webhooks',
      'nav.admin.mobile',
      'nav.admin.admin-settings',
      'nav.admin.bi',
    ]);
  });

  it('Platform domain path points to its first child (Security)', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const platform = nav.find((d) => d.label === 'Platform');
    expect(platform?.path).toBe('/admin/security');
  });

  it('Admin Settings section contains exactly 3 Platform-owned children in order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const platform = nav.find((d) => d.label === 'Platform');
    const settings = platform?.children?.find((c) => c.id === 'nav.admin.admin-settings');
    expect(settings?.children?.map((c) => c.id)).toEqual([
      'nav.admin.app-settings',
      'nav.admin.countries',
      'nav.admin.payment-methods',
    ]);
  });

  it('Security section preserves all 11 nested children in order', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const platform = nav.find((d) => d.label === 'Platform');
    const security = platform?.children?.find((c) => c.id === 'nav.admin.security');
    expect(security?.children?.map((c) => c.id)).toEqual([
      'nav.admin.security.landing',
      'nav.admin.security-sessions',
      'nav.admin.security-failed-logins',
      'nav.admin.security-uploads',
      'nav.admin.security-system-health',
      'nav.admin.system-settings',
      'nav.admin.membership-view',
      'nav.admin.audit',
      'nav.admin.feature-flags',
      'nav.admin.support-tickets',
      'nav.admin.queue',
    ]);
  });

  it('permission-filtered: granting only Platform permissions renders only the Platform domain', () => {
    const nav = resolveAdminNav(
      enT,
      (p) => p === 'sidebar.security-dashboard' || p === 'notifications.broadcast' || p === 'sidebar.bi-dashboard' || p === 'sidebar.bi-observability',
      allFlags,
    );
    expect(nav.map((d) => d.label)).toEqual(['Platform']);
    expect(nav[0].children?.map((c) => c.id)).toEqual(['nav.admin.security', 'nav.admin.notifications', 'nav.admin.bi']);
  });

  it('permission-filtered: no Platform permissions granted hides the Platform domain entirely (empty state)', () => {
    const nav = resolveAdminNav(enT, (p) => p === 'sidebar.users', allFlags);
    expect(nav.map((d) => d.label)).toEqual(['People']);
    expect(nav.some((d) => d.label === 'Platform')).toBe(false);
  });

  it('feature flags: Platform sections are not feature-flag-gated (flags do not apply to Platform)', () => {
    const platform = ADMIN_NAV.find((d) => d.id === 'nav.admin.domain.platform');
    expect(platform).toBeDefined();
    const walk = (items: NavDefinition[]): boolean =>
      items.every((i) => !i.requiredFlag && !i.featureFlag && (!i.children || walk(i.children)));
    expect(walk(platform!.children ?? [])).toBe(true);
  });

  it('saved layout: within-domain order for Platform sections is honored recursively', () => {
    const layout = new Map<string | null, string[]>();
    layout.set('nav.admin.domain.platform', ['sidebar.mobile', 'sidebar.bi', 'sidebar.security-dashboard', 'sidebar.notifications']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    const platform = nav.find((d) => d.label === 'Platform');
    expect(platform?.children?.map((c) => c.permissionKey)).toEqual([
      'sidebar.mobile',
      'sidebar.bi',
      'sidebar.security-dashboard',
      'sidebar.notifications',
      'sidebar.integration',
      'sidebar.webhooks',
      'sidebar.admin-settings',
    ]);
  });

  it('saved layout: legacy key compatibility for nested Platform sections (sidebar.security-dashboard)', () => {
    const layout = new Map<string | null, string[]>();
    layout.set('sidebar.security-dashboard', ['sidebar.failed-logins', 'sidebar.audit', 'sidebar.active-sessions']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    const platform = nav.find((d) => d.label === 'Platform');
    const security = platform?.children?.find((c) => c.id === 'nav.admin.security');
    expect(security?.children?.map((c) => c.permissionKey).slice(0, 3)).toEqual([
      'sidebar.failed-logins',
      'sidebar.audit',
      'sidebar.active-sessions',
    ]);
  });

  it('saved layout: stale keys are dropped without orphaning any Platform module', () => {
    const layout = new Map<string | null, string[]>();
    layout.set('nav.admin.domain.platform', ['stale.key.one', 'sidebar.webhooks', 'sidebar.integration']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    const platform = nav.find((d) => d.label === 'Platform');
    expect(platform?.children?.map((c) => c.id)).toEqual([
      'nav.admin.webhooks',
      'nav.admin.integration',
      'nav.admin.security',
      'nav.admin.notifications',
      'nav.admin.mobile',
      'nav.admin.admin-settings',
      'nav.admin.bi',
    ]);
  });

  it('every §1.8 Platform module resolves under the Platform domain with immutable ids intact', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const platform = nav.find((d) => d.label === 'Platform');
    const ids = platform?.children?.map((c) => c.id) ?? [];
    for (const expected of [
      'nav.admin.security',
      'nav.admin.notifications',
      'nav.admin.integration',
      'nav.admin.webhooks',
      'nav.admin.mobile',
      'nav.admin.admin-settings',
      'nav.admin.bi',
    ]) {
      expect(ids).toContain(expected);
    }
    const flat = collectIds(ADMIN_NAV);
    expect(new Set(flat).size).toBe(flat.length);
  });
});

describe('Commit 11 — Sidebar verification (domain-level permission sets + marketplace flag toggle)', () => {
  const DOMAIN_LABELS = ['Dashboard', 'People', 'Facilities', 'Coaching', 'Competitions', 'Commerce', 'Finance', 'Accounting', 'Platform'];

  const collectDomainKeys = (domain: NavDefinition): string[] =>
    Array.from(new Set(collectPermissionKeys([domain])));

  const domainKeySets = (): string[][] => ADMIN_NAV.map((d) => collectDomainKeys(d));

  it('permission-filtered: granting only one domain\'s permission set renders exactly that domain (all 8)', () => {
    const keySets = domainKeySets();
    keySets.forEach((keys, i) => {
      expect(keys.length).toBeGreaterThan(0);
      const can = (p: string) => keys.includes(p);
      const nav = resolveAdminNav(enT, can, allFlags);
      expect(nav.map((d) => d.label)).toEqual([DOMAIN_LABELS[i]]);
      expect(nav[0].children?.length).toBeGreaterThan(0);
    });
  });

  it('permission-filtered: revoking every key of one domain removes exactly that domain (7 remain)', () => {
    const keySets = domainKeySets();
    keySets.forEach((keys, i) => {
      const can = (p: string) => !keys.includes(p);
      const nav = resolveAdminNav(enT, can, allFlags);
      const labels = nav.map((d) => d.label);
      expect(labels).not.toContain(DOMAIN_LABELS[i]);
      expect(labels.length).toBe(8);
    });
  });

  it('domain permission sets are disjoint — no sidebar key is shared across two domains', () => {
    const keySets = domainKeySets();
    const owner = new Map<string, string>();
    keySets.forEach((keys, i) => {
      for (const k of keys) {
        if (owner.has(k) && owner.get(k) !== DOMAIN_LABELS[i]) {
          expect.unreachable(`permission key ${k} is shared by ${owner.get(k)} and ${DOMAIN_LABELS[i]}`);
        }
        owner.set(k, DOMAIN_LABELS[i]);
      }
    });
    expect(owner.size).toBeGreaterThan(0);
  });

  it('feature-flag: marketplace flag toggle ON shows Marketplace, OFF hides it (Commerce remains), re-ON restores', () => {
    const on = resolveAdminNav(enT, allCan, allFlags);
    const off = resolveAdminNav(enT, allCan, (f) => f !== 'app.marketplace_enabled');
    const reOn = resolveAdminNav(enT, allCan, allFlags);
    const commerceOn = on.find((d) => d.label === 'Commerce');
    const commerceOff = off.find((d) => d.label === 'Commerce');
    const commerceReOn = reOn.find((d) => d.label === 'Commerce');
    expect(commerceOn?.children?.some((c) => c.id === 'nav.admin.marketplace')).toBe(true);
    expect(commerceOff?.children?.some((c) => c.id === 'nav.admin.marketplace')).toBe(false);
    expect(commerceOff?.children?.some((c) => c.id === 'nav.admin.pricing')).toBe(true);
    expect(commerceReOn?.children?.some((c) => c.id === 'nav.admin.marketplace')).toBe(true);
  });
});

describe('Commit 12 — Search finds all modules under new domain paths', () => {
  const adminAll = () => buildAdminSearchCommands(resolveAdminNav(enT, allCan, allFlags));
  const flattenIds = (items: ResolvedNavItem[]): string[] =>
    items.flatMap((i) => [i.id, ...(i.children ? flattenIds(i.children) : [])]);
  const collectIds = (nav: ResolvedNavItem[]): Set<string> => new Set(flattenIds(nav));

  it('search index covers every admin module under the 9 domains', () => {
    const commands = adminAll();
    const registryIds = collectIds(resolveAdminNav(enT, allCan, allFlags));
    const commandIds = new Set(commands.map((c) => c.id));
    for (const id of registryIds) expect(commandIds.has(id)).toBe(true);
  });

  it('every admin command carries a nav.admin.* immutable id and its top-level domain id', () => {
    const commands = adminAll();
    for (const c of commands) {
      expect(c.id.startsWith('nav.admin.')).toBe(true);
      expect(c.domainId.startsWith('nav.admin.domain.')).toBe(true);
    }
    const domains = new Set(commands.map((c) => c.domainId));
    expect(domains.size).toBe(9);
  });

  it('admin commands are grouped by their domain label', () => {
    const commands = adminAll();
    for (const c of commands) {
      const domain = resolveAdminNav(enT, allCan, allFlags).find((d) => d.id === c.domainId);
      expect(domain).toBeDefined();
      expect(c.group).toBe(domain!.label);
    }
  });

  it('searching by module label finds the module under its new domain path', () => {
    const commands = adminAll();
    const hits = matchNavSearchCommands(commands, 'settlements');
    expect(hits.some((c) => c.id === 'nav.admin.settlements')).toBe(true);
    expect(hits.every((c) => c.group === 'Commerce')).toBe(true);
  });

  it('searching by domain path finds modules under that path', () => {
    const commands = adminAll();
    const hits = matchNavSearchCommands(commands, '/admin/security');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((c) => c.group === 'Platform')).toBe(true);
  });

  it('search is permission-gated: only granted modules surface', () => {
    const commands = buildAdminSearchCommands(resolveAdminNav(enT, (p) => p === 'sidebar.dashboard', allFlags));
    expect(commands.map((c) => c.id).sort()).toEqual(['nav.admin.dashboard', 'nav.admin.domain.dashboard']);
  });

  it('search is feature-flag gated: marketplace OFF hides Marketplace but keeps Commerce', () => {
    const off = buildAdminSearchCommands(resolveAdminNav(enT, allCan, (f) => f !== 'app.marketplace_enabled'));
    expect(off.some((c) => c.id === 'nav.admin.marketplace')).toBe(false);
    expect(off.some((c) => c.domainId === 'nav.admin.domain.commerce')).toBe(true);
  });

  it('search never leaks admin modules to a user with no admin permissions', () => {
    const commands = buildAdminSearchCommands(resolveAdminNav(enT, noneCan, allFlags));
    expect(commands.length).toBe(0);
  });

  it('legacy public nav commands are preserved verbatim for backward compatibility', () => {
    const ids = LEGACY_NAV_COMMANDS.map((c) => c.id);
    expect(ids).toEqual([
      'nav-book', 'nav-marketplace', 'nav-bookings', 'nav-membership',
      'nav-tournaments', 'nav-academies', 'nav-coaches', 'nav-notifications', 'nav-profile',
    ]);
    expect(LEGACY_NAV_COMMANDS.every((c) => c.group === 'Navigation')).toBe(true);
    expect(LEGACY_NAV_COMMANDS.some((c) => c.id.startsWith('nav-admin'))).toBe(false);
  });

  it('legacy admin role-checked commands no longer exist as standalone nav commands', () => {
    const legacy = LEGACY_NAV_COMMANDS.map((c) => c.id);
    expect(legacy).not.toContain('nav-admin');
    expect(legacy).not.toContain('nav-reception');
    expect(legacy).not.toContain('nav-finance');
    expect(legacy).not.toContain('nav-settlements');
  });
});

describe('Phase 2-a saved-layout resolution (nav.admin.* ids)', () => {
  it('resolves with a saved layout expressed using legacy permission keys', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['sidebar.dashboard', 'sidebar.users']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    expect(nav.length).toBe(9);
  });

  it('silently drops stale keys from saved layouts', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['stale.key.one', 'sidebar.dashboard', 'no.such.key']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    expect(nav.length).toBe(9);
  });
});

describe('Phase 1 parity gate — org sidebar (buildOrgNavItems vs Navigation Registry)', () => {
  function withBundle(bundle: Record<string, string>, fn: () => void) {
    const prev = useI18nStore.getState().bundle;
    useI18nStore.setState({ bundle });
    try {
      fn();
    } finally {
      useI18nStore.setState({ bundle: prev });
    }
  }

  function assertOrgParity(can: (p: string) => boolean, orgId: string, t: (k: string) => string) {
    const legacy = buildLegacyOrgNavItems(can, orgId) as unknown as ResolvedNavItem[];
    const registry = resolveOrgNav(can, orgId, t);
    const diff = firstDiff(registry, legacy);
    expect(diff).toBeNull();
  }

  it('matches with default EN translations, all permissions', () => {
    withBundle({ ...defaults }, () => assertOrgParity(allCan, '7', enT));
  });

  it('matches under strict translation (literal vs key classification)', () => {
    const strictBundle: Record<string, string> = {};
    for (const [k] of Object.entries(defaults)) strictBundle[k] = `SENTINEL-${k}`;
    withBundle(strictBundle, () => assertOrgParity(allCan, '42', sentinelT));
  });

  it('matches under an alternate locale translation', () => {
    const altBundle: Record<string, string> = {};
    for (const [k, v] of Object.entries(defaults)) altBundle[k] = `AR·${v}`;
    withBundle(altBundle, () => assertOrgParity(allCan, '123', altT));
  });

  it('matches under a partial permission allowlist', () => {
    const allowCan = (perm: string) => perm === 'org.sidebar.dashboard' || perm.startsWith('org.sidebar.org') || perm === 'org.sidebar.settings';
    withBundle({ ...defaults }, () => assertOrgParity(allowCan, '7', enT));
  });

  it('matches when no permissions are granted', () => {
    const legacy = buildLegacyOrgNavItems(noneCan, '7') as unknown as ResolvedNavItem[];
    const registry = resolveOrgNav(noneCan, '7', enT);
    expect(registry.length).toBe(0);
    expect(legacy.length).toBe(0);
  });
});

describe('Phase 1 parity gate — coach nav (legacy/coach-nav.ts vs Navigation Registry)', () => {
  it('matches definition for definition', () => {
    const legacy = LEGACY_COACH_NAV.map((i) => ({ label: i.label, icon: i.icon, path: i.path })) as unknown as ResolvedNavItem[];
    const registry = resolveCoachNav(enT);
    expect(canonicalizeList(registry)).toBe(canonicalizeList(legacy));
  });

  it('matches regardless of permission state (coach nav carries no permission keys)', () => {
    const registry = resolveCoachNav(strictT);
    expect(registry.length).toBe(6);
    expect(registry.every((i) => i.permissionKey === undefined)).toBe(true);
  });
});

describe('Phase 1 parity gate — referee nav (legacy/referee-nav.ts vs Navigation Registry)', () => {
  function assertRefereeParity(can: (p: string) => boolean) {
    const legacy = LEGACY_REFEREE_NAV.filter((item) => !item.permission || can(item.permission)).map((i) => ({
      label: i.label,
      icon: i.icon,
      path: i.path,
      ...(i.permission ? { permissionKey: i.permission } : {}),
    })) as unknown as ResolvedNavItem[];
    const registry = resolveRefereeNav(can, enT);
    const diff = firstDiff(registry, legacy);
    expect(diff).toBeNull();
  }

  it('matches with all permissions', () => assertRefereeParity(allCan));

  it('matches under a partial permission allowlist', () => {
    assertRefereeParity((p) => p === 'referee.dashboard.view' || p === 'referee.profile.view');
  });

  it('matches when no permissions are granted', () => assertRefereeParity(noneCan));
});

describe('Shared Permission Key Navigation (Consumer 4 architectural validation)', () => {
  const onlySharedKey = (p: string) => p === 'referee.assignments.view';

  it('one permission protects multiple nodes (Assignments + Matches) without merging identity', () => {
    const nav = resolveRefereeNav(onlySharedKey, enT);
    expect(nav.map((i) => i.label)).toEqual(['Assignments', 'Matches']);
    expect(nav.map((i) => i.id)).toEqual(['nav.referee.assignments', 'nav.referee.matches']);
    expect(nav.every((i) => i.permissionKey === 'referee.assignments.view')).toBe(true);
    expect(new Set(nav.map((i) => i.id)).size).toBe(2);
  });

  it('granting the shared key never grants sibling nodes under a different key', () => {
    const nav = resolveRefereeNav(onlySharedKey, enT);
    expect(nav.some((i) => i.permissionKey !== 'referee.assignments.view')).toBe(false);
  });

  it('the resolver output is deterministic: same authorization → identical order and shape', () => {
    const a = resolveRefereeNav(onlySharedKey, enT);
    const b = resolveRefereeNav(onlySharedKey, enT);
    expect(firstDiff(a, b)).toBeNull();
    expect(a.map((i) => i.label)).toEqual(b.map((i) => i.label));
  });

  it('legacy key alias resolves to every node sharing it, in registry order', () => {
    expect(REFEREE_LEGACY_KEY_TO_ID.get('referee.assignments.view')).toEqual([
      'nav.referee.assignments',
      'nav.referee.matches',
    ]);
  });
});

describe('Phase 1 parity gate — player nav (BottomNav vs Navigation Registry)', () => {
  function expectSameFields(a: ResolvedNavItem[], b: ResolvedNavItem[]) {
    expect(a.length).toBe(b.length);
    for (let i = 0; i < a.length; i++) {
      const x = a[i];
      const y = b[i];
      expect({ label: x.label, icon: x.icon, path: x.path, permissionKey: x.permissionKey ?? null }).toEqual({
        label: y.label,
        icon: y.icon,
        path: y.path,
        permissionKey: y.permissionKey ?? null,
      });
    }
  }

  it('matches core tabs across translation modes', () => {
    for (const t of [enT, strictT, altT]) {
      const legacy = buildPlayerCoreTabs(t) as unknown as ResolvedNavItem[];
      const registry = resolvePlayerCoreTabs(t);
      expectSameFields(registry, legacy);
    }
  });

  it('matches raw more-items definitions (labels, icons, paths, permissions)', () => {
    for (const t of [enT, strictT, altT]) {
      for (const isSeller of [true, false]) {
        const legacy = buildPlayerMoreItems(t, { isSeller, chatEnabled: true }).map((i) => ({
          label: i.label,
          icon: i.icon,
          path: i.path,
          ...(i.perm ? { permissionKey: i.perm } : {}),
        }));
        const registry = PLAYER_MORE_ITEMS.filter((i) => !i.sellerOnly || isSeller).map((i) => ({
          label: resolveLabel(i.label, t),
          icon: i.icon,
          path: i.path,
          ...(i.permissionKey !== undefined ? { permissionKey: i.permissionKey } : {}),
        }));
        expectSameFields(registry as unknown as ResolvedNavItem[], legacy as unknown as ResolvedNavItem[]);
      }
    }
  });

  it('records the chat gate as feature flag community.chat_enabled', () => {
    const messages = PLAYER_MORE_ITEMS.find((i) => i.path === '/messages');
    expect(messages?.featureFlag).toBe('community.chat_enabled');
    expect(PLAYER_MORE_ITEMS.filter((i) => i.featureFlag).length).toBe(1);
  });

  it('matches the visible more-items set across gating combinations', () => {
    for (const t of [enT, strictT]) {
      for (const isSeller of [true, false]) {
        for (const chatEnabled of [true, false]) {
          for (const can of [
            allCan,
            noneCan,
            (p: string) => p.startsWith('player.'),
            (p: string) => p === 'coaches.view' || p === 'tournaments.view',
          ]) {
            const legacy = filterPlayerMoreItems(buildPlayerMoreItems(t, { isSeller, chatEnabled }), can).map(
              (i) => ({
                label: i.label,
                icon: i.icon,
                path: i.path,
                ...(i.perm ? { permissionKey: i.perm } : {}),
              }),
            );
            const registry = resolvePlayerMoreItems(t, { isSeller, chatEnabled, can });
            try {
              expectSameFields(registry, legacy as unknown as ResolvedNavItem[]);
            } catch (e) {
              throw new Error(`mismatch: t=${t} isSeller=${isSeller} chat=${chatEnabled} can=${can}\n${e}`);
            }
          }
        }
      }
    }
  });
});

describe('Navigation registry integrity (immutable ids)', () => {
  it('assigns a unique immutable id to every node in every shell', () => {
    const shells: Record<string, ReturnType<typeof collectIds>> = {
      admin: collectIds(ADMIN_NAV),
      org: collectIds(ORG_NAV),
      coach: collectIds(COACH_NAV),
      referee: collectIds(REFEREE_NAV),
      player: [...PLAYER_CORE_TABS.map((i) => i.id), ...PLAYER_MORE_ITEMS.map((i) => i.id)],
    };
    for (const [shell, ids] of Object.entries(shells)) {
      expect(findDuplicateValues(ids), `duplicate ids in ${shell}`).toEqual([]);
      expect(ids.length, `missing ids in ${shell}`).toBeGreaterThan(0);
    }
  });

  it('namespaces ids per shell (nav.admin.*, nav.org.*) and keeps them stable per node', () => {
    const adminIds = collectIds(ADMIN_NAV);
    expect(adminIds.every((id) => id.startsWith('nav.admin.'))).toBe(true);
    expect(adminIds.length).toBe(136);
    expect(ADMIN_ID_TO_KEY.size).toBe(128);

    const orgIds = collectIds(ORG_NAV);
    expect(orgIds.every((id) => id.startsWith('nav.org.'))).toBe(true);
    expect(orgIds.length).toBe(39);
    expect(ORG_ID_TO_KEY.size).toBe(32);
    // Category domains carry no permission key (they render when a permitted child passes);
    // every node that DOES carry a key must be registered in the id→key map.
    for (const id of ORG_ID_TO_KEY.keys()) expect(orgIds.includes(id)).toBe(true);

    const coachIds = collectIds(COACH_NAV);
    expect(coachIds.every((id) => id.startsWith('nav.coach.'))).toBe(true);
    expect(coachIds.length).toBe(6);
    expect(COACH_ID_TO_KEY.size).toBe(0);
    expect(COACH_LEGACY_KEY_TO_ID.size).toBe(0);

    const refereeIds = collectIds(REFEREE_NAV);
    expect(refereeIds.every((id) => id.startsWith('nav.referee.'))).toBe(true);
    expect(refereeIds.length).toBe(6);
    expect(REFEREE_ID_TO_KEY.size).toBe(6);
    for (const id of refereeIds) expect(REFEREE_ID_TO_KEY.has(id)).toBe(true);

    const playerIds = [...PLAYER_CORE_TABS.map((i) => i.id), ...PLAYER_MORE_ITEMS.map((i) => i.id)];
    expect(playerIds.every((id) => id.startsWith('nav.player.'))).toBe(true);
    expect(playerIds.length).toBe(18);
    expect(new Set(playerIds).size).toBe(18);
    for (const id of playerIds) {
      const hasPermission = [...PLAYER_MORE_ITEMS].find((i) => i.id === id)?.permissionKey !== undefined;
      if (hasPermission) expect(PLAYER_ID_TO_KEY.has(id)).toBe(true);
    }
  });

  it('maps org legacy permission keys to their nodes', () => {
    expect(ORG_LEGACY_KEY_TO_ID.get('org.sidebar.dashboard')).toEqual(['nav.org.dashboard']);
    expect(ORG_LEGACY_KEY_TO_ID.get('org.sidebar.settings')).toEqual(['nav.org.settings']);
    expect(ORG_LEGACY_KEY_TO_ID.get('org.reports.view')).toEqual(['nav.org.reports']);
    // Accounting items share a single page-level permission key.
    expect(ORG_LEGACY_KEY_TO_ID.get('org.accounting.view')).toEqual([
      'nav.org.accounting-dashboard',
      'nav.org.accounting-coa',
      'nav.org.accounting-reports',
      'nav.org.accounting-trial-balance',
      'nav.org.accounting-income-statement',
      'nav.org.accounting-balance-sheet',
      'nav.org.accounting-tax',
    ]);
    for (const [key, ids] of ORG_LEGACY_KEY_TO_ID) {
      expect(ids.length).toBeGreaterThan(0);
      if (key.startsWith('org.sidebar.')) expect(ids.length).toBe(1);
    }
  });

  it('maps shared referee permission keys to every node they protect (1 key → 2 ids)', () => {
    expect(REFEREE_LEGACY_KEY_TO_ID.size).toBe(5);
    expect(REFEREE_ID_TO_KEY.size).toBe(6);
    for (const [key, ids] of REFEREE_LEGACY_KEY_TO_ID) {
      expect(key.startsWith('referee.')).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
    const shared = [...REFEREE_LEGACY_KEY_TO_ID.entries()].filter(([, ids]) => ids.length > 1);
    expect(shared.map(([k]) => k)).toEqual(['referee.assignments.view']);
  });

  it('exposes the immutable id on every resolved item (state-keying by id)', () => {
    const adminTop = resolveAdminNav(enT, allCan, allFlags);
    const walk = (items: ResolvedNavItem[]): number =>
      items.reduce((n, it) => n + (it.id ? 1 : 0) + (it.children ? walk(it.children) : 0), 0);
    expect(walk(adminTop)).toBe(136);
    const orgTop = resolveOrgNav(allCan, '7', enT);
    expect(orgTop.every((it) => it.id !== undefined)).toBe(true);
    expect(orgTop[0].id).toBe('nav.org.dashboard');
    expect(orgTop.every((it, i) => it.id === ORG_NAV[i].id)).toBe(true);

    const coachTop = resolveCoachNav(enT);
    expect(coachTop.every((it) => it.id !== undefined)).toBe(true);
    expect(coachTop[0].id).toBe('nav.coach.dashboard');
    expect(coachTop.every((it, i) => it.id === COACH_NAV[i].id)).toBe(true);

    const refereeTop = resolveRefereeNav(allCan, enT);
    expect(refereeTop.every((it) => it.id !== undefined)).toBe(true);
    expect(refereeTop[0].id).toBe('nav.referee.dashboard');
    expect(refereeTop.every((it, i) => it.id === REFEREE_NAV[i].id)).toBe(true);

    const playerCore = resolvePlayerCoreTabs(enT);
    expect(playerCore.every((it) => it.id !== undefined)).toBe(true);
    expect(playerCore[0].id).toBe('nav.player.home');
    expect(playerCore.every((it, i) => it.id === PLAYER_CORE_TABS[i].id)).toBe(true);

    const playerMore = resolvePlayerMoreItems(enT, { isSeller: true, chatEnabled: true, can: allCan });
    expect(playerMore.every((it) => it.id !== undefined)).toBe(true);
    expect(playerMore.every((it, i) => it.id === PLAYER_MORE_ITEMS[i].id)).toBe(true);
  });

  it('maps player legacy permission keys to their nav.player.* nodes', () => {
    expect(PLAYER_ID_TO_KEY.size).toBe(12);
    expect(PLAYER_LEGACY_KEY_TO_ID.size).toBe(12);
    expect(PLAYER_LEGACY_KEY_TO_ID.get('coaches.view')).toEqual(['nav.player.coaches']);
    expect(PLAYER_LEGACY_KEY_TO_ID.get('player.wallet.view')).toEqual(['nav.player.wallet']);
    expect(PLAYER_LEGACY_KEY_TO_ID.get('community.chat.view')).toEqual(['nav.player.messages']);
    for (const [key, ids] of PLAYER_LEGACY_KEY_TO_ID) {
      expect(ids.length).toBe(1);
      expect(ids[0].startsWith('nav.player.')).toBe(true);
      expect(PLAYER_ID_TO_KEY.get(ids[0])).toBe(key);
    }
  });

  it('maps legacy permission keys to the nodes that carry them (incl. section+landing pairs)', () => {
    const keyMap = ADMIN_LEGACY_KEY_TO_ID;
    expect(keyMap.has('sidebar.dashboard')).toBe(true);
    expect(keyMap.get('sidebar.dashboard')).toEqual(['nav.admin.dashboard']);
    const shared = [...keyMap.entries()].filter(([, ids]) => ids.length > 1).map(([k]) => k).sort();
    expect(shared).toEqual(
      [
        'sidebar.organisations',
        'sidebar.roles',
        'sidebar.payment-methods',
        'sidebar.countries',
        'sidebar.security-dashboard',
      ].sort(),
    );
    const [organisations] = keyMap.get('sidebar.organisations')!;
    expect(organisations).toBe('nav.admin.organisations');
    expect(keyMap.get('sidebar.organisations')).toContain('nav.admin.organisations.landing');
  });
});

describe('Navigation composition pipeline (Consumer 5 — stages composable, not coupled)', () => {
  const fullCtx: NavFilterContext = { can: allCan, flags: { 'community.chat_enabled': true }, isSeller: true };

  it('composeFilters applies stages in order and is deterministic', () => {
    const pipe = composeFilters(sellerFilter, permissionFilter, featureFlagFilter);
    const a = pipe(PLAYER_MORE_ITEMS, fullCtx).map((i) => i.id);
    const b = pipe(PLAYER_MORE_ITEMS, fullCtx).map((i) => i.id);
    expect(a).toEqual(b);
    expect(a.length).toBe(PLAYER_MORE_ITEMS.length);
    expect(a).toEqual(PLAYER_MORE_ITEMS.map((i) => i.id));
  });

  it('sellerFilter is the only stage that reads the seller context', () => {
    expect(PLAYER_MORE_ITEMS.filter((i) => i.sellerOnly).map((i) => i.id)).toEqual(['nav.player.my_shop']);
    const visible = sellerFilter(PLAYER_MORE_ITEMS, { ...fullCtx, isSeller: true }).map((i) => i.id);
    expect(visible).toContain('nav.player.my_shop');
    const hidden = sellerFilter(PLAYER_MORE_ITEMS, { ...fullCtx, isSeller: false }).map((i) => i.id);
    expect(hidden).not.toContain('nav.player.my_shop');
    expect(hidden.length).toBe(PLAYER_MORE_ITEMS.length - 1);
  });

  it('permissionFilter is the only stage that reads can()', () => {
    const gated = permissionFilter(PLAYER_MORE_ITEMS, { ...fullCtx, can: (p) => p.startsWith('player.') }).map((i) => i.id);
    expect(gated).toContain('nav.player.wallet');
    expect(gated).not.toContain('nav.player.coaches');
    expect(gated).not.toContain('nav.player.tournaments');
    expect(gated).toContain('nav.player.notifications');
    const none = permissionFilter(PLAYER_MORE_ITEMS, { ...fullCtx, can: noneCan }).map((i) => i.id);
    expect(none).toEqual(['nav.player.matches', 'nav.player.notifications', 'nav.player.my_shop']);
  });

  it('featureFlagFilter is the only stage that reads the flag context', () => {
    const flagged = featureFlagFilter(PLAYER_MORE_ITEMS, { ...fullCtx, flags: { 'community.chat_enabled': false } }).map((i) => i.id);
    expect(flagged).not.toContain('nav.player.messages');
    const enabled = featureFlagFilter(PLAYER_MORE_ITEMS, { ...fullCtx, flags: { 'community.chat_enabled': true } }).map((i) => i.id);
    expect(enabled).toContain('nav.player.messages');
  });

  it('requiredFlagFilter removes nodes whose required flag is false', () => {
    const item = { id: 'nav.player.sample', label: T('nav.matches'), icon: 'x', path: '/x', requiredFlag: 'app.marketplace_enabled' };
    expect(requiredFlagFilter([item], { ...fullCtx, flags: { 'app.marketplace_enabled': true } })).toHaveLength(1);
    expect(requiredFlagFilter([item], { ...fullCtx, flags: { 'app.marketplace_enabled': false } })).toHaveLength(0);
  });

  it('the player More pipeline is the exact composition Seller → Permission → Flag', () => {
    const composed = composeFilters(sellerFilter, permissionFilter, featureFlagFilter);
    expect(PLAYER_MORE_PIPELINE(PLAYER_MORE_ITEMS, fullCtx).map((i) => i.id)).toEqual(
      composed(PLAYER_MORE_ITEMS, fullCtx).map((i) => i.id),
    );
    const ctx: NavFilterContext = {
      can: (p) => p.startsWith('player.'),
      flags: { 'community.chat_enabled': false },
      isSeller: false,
    };
    expect(PLAYER_MORE_PIPELINE(PLAYER_MORE_ITEMS, ctx).map((i) => i.id)).toEqual(
      composed(PLAYER_MORE_ITEMS, ctx).map((i) => i.id),
    );
  });

  it('resolvePlayerMoreItems is the pipeline + projection (no separate consumer filter)', () => {
    for (const ctx of [
      fullCtx,
      { can: noneCan, flags: { 'community.chat_enabled': true }, isSeller: true },
      { can: allCan, flags: { 'community.chat_enabled': false }, isSeller: false },
      { can: (p: string) => p === 'coaches.view' || p === 'tournaments.view', flags: { 'community.chat_enabled': true }, isSeller: true },
    ]) {
      const viaPipeline = projectPlayerMoreItems(PLAYER_MORE_PIPELINE(PLAYER_MORE_ITEMS, ctx), enT);
      const viaResolver = resolvePlayerMoreItems(enT, {
        isSeller: ctx.isSeller,
        chatEnabled: ctx.flags['community.chat_enabled'] === true,
        can: ctx.can,
      });
      expect(viaResolver.map((i) => i.id)).toEqual(viaPipeline.map((i) => i.id));
    }
  });

  it('resolvePlayerCoreTabs is the core pipeline + projection', () => {
    const viaPipeline = projectPlayerCoreTabs(PLAYER_CORE_PIPELINE(PLAYER_CORE_TABS, fullCtx), enT);
    const viaResolver = resolvePlayerCoreTabs(enT);
    expect(viaResolver.map((i) => i.id)).toEqual(viaPipeline.map((i) => i.id));
  });

  it('stages are consumer-agnostic (operate on any node list, incl. admin/org defs)', () => {
    // Top-level category domains carry no permissionKey (they render when a child
    // passes), so the permission stage preserves them; only the Dashboard leaf
    // matches the allow-list.
    const dashboardOnly = permissionFilter(ORG_NAV, { ...fullCtx, can: (p) => p === 'org.sidebar.dashboard' });
    expect(dashboardOnly.filter((i: any) => i.permissionKey).map((i: any) => i.permissionKey)).toEqual(['org.sidebar.dashboard']);
    expect(sellerFilter(ORG_NAV, fullCtx).length).toBe(ORG_NAV.length);
    const allAdm = permissionFilter(ADMIN_NAV, { ...fullCtx, can: allCan });
    expect(allAdm.length).toBeGreaterThan(0);
  });
});

describe('Phase 1 registry integrity', () => {
  it('registers every label key used in the registry', () => {
    const used: string[] = [];
    const walk = (label: ReturnType<typeof T> | ReturnType<typeof LIT>) => {
      if (label.kind === 't') used.push(label.key);
      else if (label.kind === 'composite') label.parts.forEach((p) => p.kind === 't' && used.push(p.key));
    };
    const walkDefs = (defs: NavDefinition[]) => {
      for (const d of defs) {
        walk(d.label);
        if (d.children) walkDefs(d.children);
      }
    };
    walkDefs(ADMIN_NAV);
    walkDefs(ORG_NAV);
    for (const tab of PLAYER_CORE_TABS) walk(tab.label);
    for (const item of PLAYER_MORE_ITEMS) walk(item.label);
    const missing = used.filter((k) => !defaults[k]);
    expect(missing).toEqual([]);
  });
});

describe('Consumer 6 — Workspace Registry integration (drift resolved)', () => {
  const registryWorkspace = resolveWorkspaceNav(enT);

  function collectAllKeys(nodes: WorkspaceNode[]): string[] {
    const keys: string[] = [];
    const walk = (list: WorkspaceNode[]) => {
      for (const n of list) {
        if (n.permissionKey) keys.push(n.permissionKey);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }

  function collectAllIds(nodes: WorkspaceNode[]): string[] {
    const ids: string[] = [];
    const walk = (list: WorkspaceNode[]) => {
      for (const n of list) {
        if (n.id) ids.push(n.id);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return ids;
  }

  function countNodes(nodes: WorkspaceNode[]): number {
    let c = 0;
    const walk = (list: WorkspaceNode[]) => {
      c += list.length;
      for (const n of list) if (n.children) walk(n.children);
    };
    walk(nodes);
    return c;
  }

  it('workspace resolver includes every original admin section key', () => {
    const wsKeys = new Set(collectAllKeys(registryWorkspace));
    const registryKeys = collectPermissionKeys(ADMIN_NAV);
    for (const k of registryKeys) {
      expect(wsKeys.has(k), `"${k}" should be in workspace`).toBe(true);
    }
  });

  it('workspace shows all 9 domain sections', () => {
    expect(registryWorkspace.map((d) => d.label)).toEqual([
      'Dashboard', 'People', 'Facilities', 'Coaching',
      'Competitions', 'Commerce', 'Finance', 'Accounting', 'Platform',
    ]);
  });

  it('all 15 previously-missing admin sections are now visible in the workspace', () => {
    const wsKeys = collectAllKeys(registryWorkspace);
    for (const key of [
      'sidebar.bi',
      'sidebar.sports-engine',
      'sidebar.reception',
      'sidebar.league',
      'sidebar.tournament',
      'sidebar.academy',
      'sidebar.membership',
      'sidebar.pricing',
      'sidebar.crm',
      'sidebar.hr',
      'sidebar.notifications',
      'sidebar.inventory',
      'sidebar.mobile',
      'sidebar.integration',
      'sidebar.webhooks',
    ]) {
      expect(wsKeys, `"${key}" should now appear in workspace`).toContain(key);
    }
  });

  it('all 2 previously-editor-only keys are removed', () => {
    const wsKeys = collectAllKeys(registryWorkspace);
    for (const key of [
      'sidebar.tournaments-admin',
      'sidebar.academies-admin',
    ]) {
      expect(wsKeys, `"${key}" must NOT appear in workspace`).not.toContain(key);
    }
  });

  it('every workspace node carries a nav.admin.* immutable id', () => {
    const allIds = collectAllIds(registryWorkspace);
    expect(allIds.length).toBe(136);
    expect(allIds.every((id) => id.startsWith('nav.admin.'))).toBe(true);
    expect(new Set(allIds).size).toBe(136);
  });

  it('workspace resolver is deterministic', () => {
    const a = resolveWorkspaceNav(enT);
    const b = resolveWorkspaceNav(enT);
    expect(a.map((n) => n.id).join(',')).toBe(b.map((n) => n.id).join(','));
  });

  it('workspace shares the same tree structure as ADMIN_NAV (1:1 mapping)', () => {
    const wsAllIds = collectAllIds(registryWorkspace);
    const registryAllIds = collectIds(ADMIN_NAV);
    expect(wsAllIds).toEqual(registryAllIds);
    expect(wsAllIds.length).toBe(136);
  });

  it('workspace root count matches ADMIN_NAV root', () => {
    expect(countNodes(registryWorkspace)).toBe(136);
    expect(registryWorkspace.length).toBe(ADMIN_NAV.length);
  });
});

describe('Commit 10 — Workspace DnD round-trip (saved layout compatibility)', () => {
  function workspaceKeys(nodes: WorkspaceNode[]): Set<string> {
    const keys = new Set<string>();
    const walk = (list: WorkspaceNode[]) => {
      for (const n of list) {
        keys.add(n.permissionKey);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return keys;
  }

  it('DnD editor shows all 9 domains as sortable containers', () => {
    const ws = resolveWorkspaceNav(enT);
    const containers = buildDefaultContainers(ws);
    const root = containers.get(null);
    expect(root).toHaveLength(9);
    expect(root).toEqual(ws.map((d) => d.permissionKey));
    for (const domain of ws) {
      expect(containers.has(domain.permissionKey)).toBe(true);
    }
    expect(containers.size).toBeGreaterThan(8);
  });

  it('round-trip: DnD reorder within a domain survives save → load → resolveAdminNav', () => {
    const ws = resolveWorkspaceNav(enT);
    const defaults = buildDefaultContainers(ws);
    const peopleKey = 'nav.admin.domain.people';
    const peopleChildren = defaults.get(peopleKey) ?? [];
    expect(peopleChildren.length).toBeGreaterThan(1);
    const reordered = [peopleChildren[peopleChildren.length - 1], ...peopleChildren.slice(0, -1)];
    const containers = new Map<string | null, string[]>(defaults);
    containers.set(peopleKey, reordered);

    const rows = serializeContainers(containers);
    const savedLayout = new Map<string | null, string[]>();
    for (const row of rows) savedLayout.set(row.parentKey, row.orderedKeys);

    const nav = resolveAdminNav(enT, allCan, allFlags, savedLayout);
    const people = nav.find((d) => d.id === 'nav.admin.domain.people');
    expect(people).toBeDefined();
    expect(people?.children?.map((c) => c.permissionKey ?? c.id)).toEqual(reordered);
    expect(nav.length).toBe(9);
  });

  it('round-trip: DnD editor load path (mergeSavedLayout) restores the reorder', () => {
    const ws = resolveWorkspaceNav(enT);
    const defaults = buildDefaultContainers(ws);
    const validKeys = workspaceKeys(ws);
    const peopleKey = 'nav.admin.domain.people';
    const peopleChildren = defaults.get(peopleKey) ?? [];
    const reordered = [peopleChildren[peopleChildren.length - 1], ...peopleChildren.slice(0, -1)];
    const containers = new Map<string | null, string[]>(defaults);
    containers.set(peopleKey, reordered);
    const rows = serializeContainers(containers);

    const merged = mergeSavedLayout(defaults, rows, validKeys);
    expect(merged.get(peopleKey)).toEqual(reordered);
    expect(merged.get(null)).toEqual(ws.map((d) => d.permissionKey));
  });

  it('round-trip: stale keys are dropped on load without orphaning any module', () => {
    const ws = resolveWorkspaceNav(enT);
    const defaults = buildDefaultContainers(ws);
    const validKeys = workspaceKeys(ws);
    const peopleKey = 'nav.admin.domain.people';
    const peopleChildren = defaults.get(peopleKey) ?? [];
    const rows: WorkspaceLayoutRow[] = [
      { parentKey: peopleKey, orderedKeys: ['stale.key', peopleChildren[0], peopleChildren[1]] },
    ];
    const merged = mergeSavedLayout(defaults, rows, validKeys);
    expect(merged.get(peopleKey)).toEqual([
      peopleChildren[0],
      peopleChildren[1],
      ...peopleChildren.slice(2),
    ]);
  });

  it('saved layout compatibility: legacy permission-key rows round-trip through the editor', () => {
    const ws = resolveWorkspaceNav(enT);
    const defaults = buildDefaultContainers(ws);
    const validKeys = workspaceKeys(ws);
    const rows: WorkspaceLayoutRow[] = [
      {
        parentKey: 'sidebar.organisations',
        orderedKeys: ['sidebar.organisation-types', 'sidebar.organisations', 'sidebar.branch-access'],
      },
    ];
    const merged = mergeSavedLayout(defaults, rows, validKeys);
    const savedLayout = new Map<string | null, string[]>(merged);
    const nav = resolveAdminNav(enT, allCan, allFlags, savedLayout);
    const people = nav.find((d) => d.label === 'People');
    const orgSection = people?.children?.find((c) => c.id === 'nav.admin.organisations');
    expect(orgSection?.children?.map((c) => c.permissionKey)).toEqual([
      'sidebar.organisation-types',
      'sidebar.organisations',
      'sidebar.branch-access',
    ]);
  });
});

describe('Workspace: frozen fixture preserved for audit', () => {
  it('fixture buildSections() is frozen and still callable', () => {
    const sections = buildSections();
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].label).toBe('Dashboard');
  });
});
