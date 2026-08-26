import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRegistryDefaultsMap, useI18nStore } from '../../i18n';
import { ADMIN_NAV, resolveAdminNav, type ResolvedNavItem, type NavDefinition } from '../../navigation';

const __dirname = dirname(fileURLToPath(import.meta.url));

// From frontend/src/navigation/parity/ → repo root
const SEED_PATH = resolve(__dirname, '../../../../database/seeds/001_baseline.sql');

const DOMAIN_KEYS = [
  'nav.admin.domain.dashboard',
  'nav.admin.domain.people',
  'nav.admin.domain.facilities',
  'nav.admin.domain.coaching',
  'nav.admin.domain.competitions',
  'nav.admin.domain.commerce',
  'nav.admin.domain.finance',
  'nav.admin.domain.platform',
];

const EN_VALUES: Record<string, string> = {
  'nav.admin.domain.dashboard': 'Dashboard',
  'nav.admin.domain.people': 'People',
  'nav.admin.domain.facilities': 'Facilities',
  'nav.admin.domain.coaching': 'Coaching',
  'nav.admin.domain.competitions': 'Competitions',
  'nav.admin.domain.commerce': 'Commerce',
  'nav.admin.domain.finance': 'Finance',
  'nav.admin.domain.platform': 'Platform',
};

const AR_VALUES: Record<string, string> = {
  'nav.admin.domain.dashboard': 'لوحة القيادة',
  'nav.admin.domain.people': 'أشخاص',
  'nav.admin.domain.facilities': 'منشآت',
  'nav.admin.domain.coaching': 'تدريب',
  'nav.admin.domain.competitions': 'منافسات',
  'nav.admin.domain.commerce': 'تجارة',
  'nav.admin.domain.finance': 'مالية',
  'nav.admin.domain.platform': 'منصة',
};

interface StructuralItem {
  id: string;
  icon?: string;
  path: string;
  permissionKey?: string;
  requiredFlag?: string;
  featureFlag?: string;
  children: StructuralItem[];
}

function toStructure(items: ResolvedNavItem[]): StructuralItem[] {
  return items.map((it) => ({
    id: it.id,
    ...(it.icon !== undefined ? { icon: it.icon } : {}),
    path: it.path,
    ...(it.permissionKey !== undefined ? { permissionKey: it.permissionKey } : {}),
    ...(it.requiredFlag !== undefined ? { requiredFlag: it.requiredFlag } : {}),
    ...(it.featureFlag !== undefined ? { featureFlag: it.featureFlag } : {}),
    children: it.children ? toStructure(it.children) : [],
  }));
}

function tKeysUsedInAdminNav(defs: NavDefinition[]): string[] {
  const keys: string[] = [];
  const walk = (d: NavDefinition) => {
    if (d.label.kind === 't') keys.push(d.label.key);
    else if (d.label.kind === 'composite') {
      for (const p of d.label.parts) if (p.kind === 't') keys.push(p.key);
    }
    if (d.children) for (const c of d.children) walk(c);
  };
  for (const d of defs) walk(d);
  return keys;
}

describe('Commit 9 — Translation integrity (9 admin business-domain labels, EN + AR)', () => {
  const defaults = getRegistryDefaultsMap();
  const enT = (key: string) => defaults[key] ?? key;
  const allCan = () => true;
  const allFlags = () => true;

  it('all 8 domain keys are registered in the EN translation registry with exact values', () => {
    for (const key of DOMAIN_KEYS) {
      expect(defaults[key], `EN default missing for ${key}`).toBe(EN_VALUES[key]);
    }
  });

  it('all 9 domain labels resolve through T() or LIT (Accounting uses LIT)', () => {
    const top = ADMIN_NAV;
    expect(top.length).toBe(9);
    for (let i = 0; i < 9; i++) {
      const kind = top[i].label.kind;
      if (top[i].id === 'nav.admin.domain.accounting') {
        expect(kind, `Accounting label should be LIT`).toBe('lit');
      } else {
        expect(kind, `label[${i}] should be T()`).toBe('t');
        const key = (top[i].label as { kind: 't'; key: string }).key;
        expect(DOMAIN_KEYS).toContain(key);
      }
    }
  });

  it('all 8 AR values exist in the seed source for locale "ar"', () => {
    const seed = readFileSync(SEED_PATH, 'utf8');
    const rowRe = /\((\d+),'([^']+)','([^']+)','([^']+)',0,'([^']+)','([^']+)'\)/g;
    const rows = new Map<string, string>();
    let m: RegExpExecArray | null;
    while ((m = rowRe.exec(seed)) !== null) {
      if (m[3] === 'ar') rows.set(m[2], m[4]);
    }
    for (const key of DOMAIN_KEYS) {
      expect(rows.get(key), `AR row missing in seed for ${key}`).toBe(AR_VALUES[key]);
    }
  });

  it('resolves all 9 domain labels correctly under the EN bundle', () => {
    const nav = resolveAdminNav(enT, allCan, allFlags);
    const enVals = Object.values(EN_VALUES);
    expect(nav.map((d) => d.label)).toEqual([
      ...enVals.slice(0, 7), 'Accounting', ...enVals.slice(7),
    ]);
  });

  it('resolves all 9 domain labels correctly under an AR bundle', () => {
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arT = (key: string) => arBundle[key] ?? key;
    const nav = resolveAdminNav(arT, allCan, allFlags);
    const arVals = Object.values(AR_VALUES);
    expect(nav.map((d) => d.label)).toEqual([
      ...arVals.slice(0, 7), 'Accounting', ...arVals.slice(7),
    ]);
  });

  it('locale switching changes only labels — structure is byte-identical across locales', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    expect(toStructure(enNav)).toEqual(toStructure(arNav));
    expect(enNav.map((d) => d.label)).not.toEqual(arNav.map((d) => d.label));
  });

  it('navigation IDs remain identical (9 domain + all children)', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const ids: string[] = [];
    const walk = (list: ResolvedNavItem[]) => {
      for (const it of list) {
        ids.push(it.id);
        if (it.children) walk(it.children);
      }
    };
    walk(enNav);
    expect(ids.length).toBe(139);
    expect(ids.filter((id) => DOMAIN_KEYS.includes(id)).length).toBe(8);
    expect(ids).toEqual(ADMIN_NAV.flatMap((d) => collectNodeIds(d)));
  });

  it('permission keys remain identical and unchanged across locales', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const keys = (items: ResolvedNavItem[]): (string | undefined)[] =>
      items.flatMap((it) => [
        it.permissionKey,
        ...(it.children ? keys(it.children) : []),
      ]);
    expect(keys(enNav)).toEqual(keys(arNav));
    expect(keys(enNav)).toContain('sidebar.dashboard');
  });

  it('routes remain identical and unchanged across locales', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const paths = (items: ResolvedNavItem[]): string[] =>
      items.flatMap((it) => [it.path, ...(it.children ? paths(it.children) : [])]);
    expect(paths(enNav)).toEqual(paths(arNav));
    expect(paths(enNav)).toContain('/admin/security');
  });

  it('icons remain identical and unchanged across locales', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const icons = (items: ResolvedNavItem[]): (string | undefined)[] =>
      items.flatMap((it) => [it.icon, ...(it.children ? icons(it.children) : [])]);
    expect(icons(enNav)).toEqual(icons(arNav));
  });

  it('feature flags remain identical and unchanged across locales', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const flags = (items: ResolvedNavItem[]): (string | undefined)[] =>
      items.flatMap((it) => [it.featureFlag, ...(it.children ? flags(it.children) : [])]);
    expect(flags(enNav)).toEqual(flags(arNav));
  });

  it('ordering remains identical across locales (top-level + recursive)', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const order = (items: ResolvedNavItem[]): string =>
      JSON.stringify(items.map((it) => [it.id, ...(it.children ? order(it.children) : [])]));
    expect(order(enNav)).toBe(order(arNav));
    expect(enNav.map((d) => d.label)).toEqual([
      'Dashboard', 'People', 'Facilities', 'Coaching',
      'Competitions', 'Commerce', 'Finance', 'Accounting', 'Platform',
    ]);
  });

  it('hierarchy remains identical across locales (parent→child nesting unchanged)', () => {
    const enNav = resolveAdminNav(enT, allCan, allFlags);
    const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
    const arNav = resolveAdminNav((key: string) => arBundle[key] ?? key, allCan, allFlags);
    const depth = (items: ResolvedNavItem[], level: number): number[] =>
      items.flatMap((it) => [level, ...(it.children ? depth(it.children, level + 1) : [])]);
    expect(depth(enNav, 1)).toEqual(depth(arNav, 1));
    const platforms = (items: ResolvedNavItem[]): ResolvedNavItem | undefined =>
      items.find((it) => it.id === 'nav.admin.domain.platform');
    const enPlatform = platforms(enNav);
    expect(enPlatform?.children?.length).toBe(7);
  });

  it('no translation key is orphaned — every registry key is used by ADMIN_NAV', () => {
    const used = new Set(tKeysUsedInAdminNav(ADMIN_NAV));
    for (const key of DOMAIN_KEYS) {
      expect(used.has(key), `orphaned registry key ${key}`).toBe(true);
    }
  });

  it('no registry key is missing — every T() key used in ADMIN_NAV has a registry default', () => {
    const used = tKeysUsedInAdminNav(ADMIN_NAV);
    const missing = used.filter((key) => !(key in defaults));
    expect(missing).toEqual([]);
  });

  it('works under a live i18n store switch (EN → AR → EN)', () => {
    const prev = useI18nStore.getState().bundle;
    const apply = (bundle: Record<string, string>) => {
      useI18nStore.setState({ bundle });
      const nav = resolveAdminNav((key: string) => useI18nStore.getState().bundle[key] ?? key, allCan, allFlags);
      return nav.map((d) => d.label);
    };
    try {
      const arBundle: Record<string, string> = { ...defaults, ...AR_VALUES };
      const enVals = Object.values(EN_VALUES);
      const arVals = Object.values(AR_VALUES);
      expect(apply(arBundle)).toEqual([
        ...arVals.slice(0, 7), 'Accounting', ...arVals.slice(7),
      ]);
      expect(apply(defaults)).toEqual([
        ...enVals.slice(0, 7), 'Accounting', ...enVals.slice(7),
      ]);
    } finally {
      useI18nStore.setState({ bundle: prev });
    }
  });
});

function collectNodeIds(d: NavDefinition): string[] {
  return [d.id, ...(d.children ? d.children.flatMap(collectNodeIds) : [])];
}
