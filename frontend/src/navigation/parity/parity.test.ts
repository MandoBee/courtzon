import { describe, it, expect } from 'vitest';
import { getRegistryDefaultsMap, useI18nStore } from '../../i18n';
import { buildLegacyAdminNavItems } from './legacy/admin-sidebar';
import { buildLegacyOrgNavItems } from './legacy/org-sidebar';
import { COACH_NAV as LEGACY_COACH_NAV } from './legacy/coach-nav';
import { buildSections } from '../../pages/admin/sidebar-layout/SidebarLayoutPage';
import { REFEREE_NAV as LEGACY_REFEREE_NAV } from '../../pages/referee/referee-nav';
import {
  buildPlayerCoreTabs,
  buildPlayerMoreItems,
  filterPlayerMoreItems,
} from '../../components/layout/BottomNav';
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
  PLAYER_CORE_TABS,
  PLAYER_MORE_ITEMS,
  T,
  LIT,
  resolveAdminNav,
  resolveOrgNav,
  resolveCoachNav,
  resolveRefereeNav,
  resolvePlayerCoreTabs,
  resolvePlayerMoreItems,
  resolveLabel,
  type ResolvedNavItem,
  type NavDefinition,
} from '../../navigation';
import {
  canonicalizeList,
  firstDiff,
  collectPermissionKeys,
  collectIds,
  flattenTree,
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

describe('Phase 1 parity gate — referee nav (referee-nav.ts vs Navigation Registry)', () => {
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

describe('Known drift: Workspace editor (buildSections) vs production sidebar (registry)', () => {
  const registryTop = resolveAdminNav(enT, allCan, allFlags);
  const editorTop = buildSections() as unknown as ResolvedNavItem[];

  const regMap = flattenTree(registryTop);
  const edMap = flattenTree(editorTop);
  const regKeys = [...regMap.keys()];
  const edKeys = [...edMap.keys()];

  it('documents sections present in the sidebar but missing from the editor', () => {
    const missingFromEditor = regKeys.filter((k) => !edMap.has(k)).sort();
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
      expect(missingFromEditor, `expected ${key} to be missing from editor`).toContain(key);
    }
    console.log('[drift] sidebar-only (absent from editor):', missingFromEditor.join(', '));
  });

  it('documents sections present only in the editor', () => {
    const onlyInEditor = edKeys.filter((k) => !regMap.has(k)).sort();
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
      expect(onlyInEditor, `expected ${key} to be present only in editor`).toContain(key);
    }
    console.log('[drift] editor-only:', onlyInEditor.join(', '));
  });

  it('documents shared keys whose label or path drifted', () => {
    const shared = regKeys.filter((k) => edMap.has(k));
    const labelDrift: string[] = [];
    const pathDrift: string[] = [];
    for (const k of shared) {
      const r = regMap.get(k)!;
      const e = edMap.get(k)!;
      if (r.label !== e.label) labelDrift.push(`${k}: registry="${r.label}" vs editor="${e.label}"`);
      if (r.path !== e.path) pathDrift.push(`${k}: registry="${r.path}" vs editor="${e.path}"`);
    }
    expect(labelDrift).toContain('sidebar.roles: registry="Roles" vs editor="All Roles"');
    expect(pathDrift).toContain('sidebar.finance: registry="/admin/finance" vs editor="/admin/withdrawal-requests"');
    console.log('[drift] label differences:', labelDrift.join('\n  '));
    console.log('[drift] path differences:', pathDrift.join('\n  '));
  });

  it('documents that the editor assigns icons to child items while the sidebar does not', () => {
    const countDeepIcons = (items: ResolvedNavItem[], depth: number): number =>
      items.reduce((sum, it) => {
        let n = depth >= 1 && it.icon !== undefined ? 1 : 0;
        if (it.children) n += countDeepIcons(it.children, depth + 1);
        return sum + n;
      }, 0);
    const deepIconsInEditor = countDeepIcons(editorTop, 0);
    const deepIconsInRegistry = countDeepIcons(registryTop, 0);
    console.log(`[drift] non-top-level nodes with icons: editor=${deepIconsInEditor} registry=${deepIconsInRegistry}`);
    expect(deepIconsInEditor).toBeGreaterThan(deepIconsInRegistry);
    expect(deepIconsInRegistry).toBeLessThanOrEqual(1);
  });
});
