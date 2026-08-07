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

function assertAdminParity(t: (k: string) => string, can: (p: string) => boolean, flag: (k: string) => boolean, savedLayout?: Map<string | null, string[]>) {
  const legacy = buildLegacyAdminNavItems(t, can, flag, savedLayout) as unknown as ResolvedNavItem[];
  const registry = resolveAdminNav(t, can, flag, savedLayout);
  const diff = firstDiff(registry, legacy);
  expect(diff).toBeNull();
}

describe('Phase 1 parity gate — admin sidebar (buildNavItems vs Navigation Registry)', () => {
  it('matches with default EN translations, all permissions, all flags', () => {
    assertAdminParity(enT, allCan, allFlags);
  });

  it('matches under strict translation (literal vs key classification)', () => {
    assertAdminParity(strictT, allCan, allFlags);
  });

  it('matches under an alternate locale translation', () => {
    assertAdminParity(altT, allCan, allFlags);
  });

  it('matches with a saved root reorder', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['sidebar.dashboard', 'sidebar.reports', 'sidebar.users', 'sidebar.security-dashboard', 'sidebar.organisations', 'sidebar.admin-settings']);
    assertAdminParity(enT, allCan, allFlags, layout);
  });

  it('matches with saved root + section reorders', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['sidebar.dashboard', 'sidebar.organisations', 'sidebar.security-dashboard']);
    layout.set('sidebar.organisations', ['sidebar.settlements', 'sidebar.organisation-types', 'sidebar.organisations', 'sidebar.branch-access']);
    layout.set('sidebar.admin-settings', ['sidebar.amenities', 'sidebar.sports', 'sidebar.finance', 'sidebar.countries']);
    assertAdminParity(enT, allCan, allFlags, layout);
  });

  it('matches when saved layout contains stale/unknown keys (silently dropped)', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['stale.key.one', 'sidebar.dashboard', 'no.such.key']);
    layout.set('sidebar.organisations', ['stale.section.key', 'sidebar.settlements']);
    assertAdminParity(enT, allCan, allFlags, layout);
  });

  it('matches when saved layout references a non-section key as a container', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['sidebar.dashboard']);
    layout.set('sidebar.dashboard', ['sidebar.reports']);
    assertAdminParity(enT, allCan, allFlags, layout);
  });

  it('matches under a partial permission allowlist', () => {
    const adminPerms = collectPermissionKeys(ADMIN_NAV);
    const allowCan = (perm: string) => perm.startsWith('sidebar.d') || perm === 'sidebar.users' || perm === 'sidebar.reports';
    expect(adminPerms.length).toBeGreaterThan(0);
    assertAdminParity(enT, allowCan, allFlags);
  });

  it('matches when no permissions are granted (empty nav)', () => {
    const legacy = buildLegacyAdminNavItems(enT, noneCan, allFlags) as unknown as ResolvedNavItem[];
    const registry = resolveAdminNav(enT, noneCan, allFlags);
    expect(registry.length).toBe(0);
    expect(legacy.length).toBe(0);
  });

  it('matches with feature flags toggling Marketplace and Ads sections', () => {
    const flags = (key: string) => key !== 'app.marketplace_enabled';
    assertAdminParity(enT, allCan, flags);
    const flags2 = (key: string) => key !== 'community.events_enabled';
    assertAdminParity(enT, allCan, flags2);
    const flags3 = () => false;
    assertAdminParity(enT, allCan, flags3);
  });

  it('matches under combined strict translation + permission allowlist + saved layout', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['sidebar.dashboard', 'sidebar.reports', 'sidebar.users']);
    layout.set('sidebar.organisations', ['sidebar.settlements', 'sidebar.organisation-types']);
    const allowCan = (perm: string) => perm.startsWith('sidebar.d') || perm === 'sidebar.users';
    assertAdminParity(strictT, allowCan, allFlags, layout);
  });
});

describe('Phase 2-a saved-layout resolution (nav.admin.* ids)', () => {
  it('resolves a root reorder expressed with immutable ids', () => {
    const layout = new Map<string | null, string[]>();
    layout.set(null, ['nav.admin.users', 'nav.admin.reports']);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    expect(nav.map((i) => i.label)).toEqual([
      'Users',
      'Reports',
      ...nav.slice(2).map((i) => i.label),
    ]);
    expect(nav[0].label).toBe('Users');
    expect(nav[1].label).toBe('Reports');
    expect(nav.length).toBe(26);
  });

  it('resolves a section reorder expressed with immutable ids', () => {
    const layout = new Map<string | null, string[]>();
    layout.set('nav.admin.organisations', [
      'nav.admin.settlements',
      'nav.admin.organisation-types',
      'nav.admin.organisations.landing',
      'nav.admin.branch-access',
    ]);
    const nav = resolveAdminNav(enT, allCan, allFlags, layout);
    const orgSection = nav.find((i) => i.label === 'Organisations');
    expect(orgSection?.children?.map((c) => c.label)).toEqual([
      'Settlements',
      'Types',
      'All Organisations',
      'Branch Access',
      'All Bookings',
      'Subscription Plans',
      'Subscription Requests',
    ]);
  });

  it('is backward compatible: legacy permission keys and new ids are interchangeable', () => {
    const legacyKeys = new Map<string | null, string[]>();
    legacyKeys.set(null, ['sidebar.users', 'sidebar.reports']);
    legacyKeys.set('sidebar.organisations', ['sidebar.settlements', 'sidebar.organisation-types']);

    const ids = new Map<string | null, string[]>();
    ids.set(null, ['nav.admin.users', 'nav.admin.reports']);
    ids.set('nav.admin.organisations', ['nav.admin.settlements', 'nav.admin.organisation-types']);

    const fromKeys = resolveAdminNav(enT, allCan, allFlags, legacyKeys);
    const fromIds = resolveAdminNav(enT, allCan, allFlags, ids);
    expect(firstDiff(fromKeys, fromIds)).toBeNull();
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
    expect(adminIds.length).toBe(120);
    expect(ADMIN_ID_TO_KEY.size).toBe(120);

    const orgIds = collectIds(ORG_NAV);
    expect(orgIds.every((id) => id.startsWith('nav.org.'))).toBe(true);
    expect(orgIds.length).toBe(23);
    expect(ORG_ID_TO_KEY.size).toBe(23);
    for (const id of orgIds) expect(ORG_ID_TO_KEY.has(id)).toBe(true);

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
    expect(ORG_LEGACY_KEY_TO_ID.get('org.sidebar.payment')).toEqual(['nav.org.payment']);
    expect(ORG_LEGACY_KEY_TO_ID.get('org.sidebar.settings')).toEqual(['nav.org.settings']);
    for (const [key, ids] of ORG_LEGACY_KEY_TO_ID) {
      expect(key.startsWith('org.sidebar.')).toBe(true);
      expect(ids.length).toBe(1);
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
    expect(walk(adminTop)).toBe(120);
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
    expect(permissionFilter(ORG_NAV, { ...fullCtx, can: (p) => p === 'org.sidebar.dashboard' }).length).toBe(1);
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

  it('workspace resolver produces item keys identical to ADMIN_NAV (no drift)', () => {
    const wsKeys = new Set(collectAllKeys(registryWorkspace));
    const registryKeys = new Set(collectPermissionKeys(ADMIN_NAV));
    for (const k of registryKeys) {
      expect(wsKeys.has(k), `"${k}" should be in workspace`).toBe(true);
    }
    expect(wsKeys.size).toBe(registryKeys.size);
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

  it('all 10 previously-editor-only keys are removed', () => {
    const wsKeys = collectAllKeys(registryWorkspace);
    for (const key of [
      'sidebar.tournaments-admin',
      'sidebar.academies-admin',
      'sidebar.accounting',
      'sidebar.accounting-dashboard',
      'sidebar.accounting-coa',
      'sidebar.accounting-journal',
      'sidebar.accounting-gl',
      'sidebar.accounting-invoices',
      'sidebar.accounting-periods',
      'sidebar.accounting-tax',
    ]) {
      expect(wsKeys, `"${key}" must NOT appear in workspace`).not.toContain(key);
    }
  });

  it('every workspace node carries a nav.admin.* immutable id', () => {
    const allIds = collectAllIds(registryWorkspace);
    expect(allIds.length).toBe(120);
    expect(allIds.every((id) => id.startsWith('nav.admin.'))).toBe(true);
    expect(new Set(allIds).size).toBe(120);
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
    expect(wsAllIds.length).toBe(120);
  });

  it('workspace root count matches ADMIN_NAV root', () => {
    expect(countNodes(registryWorkspace)).toBe(120);
    expect(registryWorkspace.length).toBe(ADMIN_NAV.length);
  });
});

describe('Workspace: frozen fixture preserved for audit', () => {
  it('fixture buildSections() is frozen and still callable', () => {
    const sections = buildSections();
    expect(sections.length).toBeGreaterThan(0);
    expect(sections[0].label).toBe('Dashboard');
  });
});
