import type { NavDefinition, ResolvedNavItem } from '../types';

export function toPlain(item: ResolvedNavItem): Record<string, unknown> {
  const o: Record<string, unknown> = { label: item.label };
  if (item.icon !== undefined) o.icon = item.icon;
  o.path = item.path;
  if (item.permissionKey !== undefined) o.permissionKey = item.permissionKey;
  if (item.requiredFlag !== undefined) o.requiredFlag = item.requiredFlag;
  if (item.featureFlag !== undefined) o.featureFlag = item.featureFlag;
  if (item.children !== undefined && item.children.length > 0) o.children = item.children.map(toPlain);
  return o;
}

export function canonicalize(item: ResolvedNavItem): string {
  return JSON.stringify(toPlain(item));
}

export function canonicalizeList(items: ResolvedNavItem[]): string {
  return JSON.stringify(items.map(toPlain));
}

export function firstDiff(a: ResolvedNavItem[], b: ResolvedNavItem[], path = 'root'): string | null {
  if (a.length !== b.length) return `${path}: length ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const p = `${path}[${i}]`;
    const ca = canonicalize(a[i]);
    const cb = canonicalize(b[i]);
    if (ca !== cb) return `${p}:\n  registry: ${ca}\n  legacy:   ${cb}`;
    const childDiff = firstDiff(a[i].children ?? [], b[i].children ?? [], `${p}.children`);
    if (childDiff) return childDiff;
  }
  return null;
}

export function collectPermissionKeys(defs: NavDefinition[]): string[] {
  const out: string[] = [];
  const walk = (list: NavDefinition[]) => {
    for (const d of list) {
      if (d.permissionKey !== undefined) out.push(d.permissionKey);
      if (d.children) walk(d.children);
    }
  };
  walk(defs);
  return out;
}

export function collectIds(defs: NavDefinition[]): string[] {
  const out: string[] = [];
  const walk = (list: NavDefinition[]) => {
    for (const d of list) {
      out.push(d.id);
      if (d.children) walk(d.children);
    }
  };
  walk(defs);
  return out;
}

export interface FlatNode {
  permissionKey: string;
  label: string;
  path: string;
  icon?: string;
  isSection: boolean;
}

export function flattenTree(items: ResolvedNavItem[]): Map<string, FlatNode> {
  const map = new Map<string, FlatNode>();
  const walk = (list: ResolvedNavItem[]) => {
    for (const it of list) {
      if (it.permissionKey !== undefined) {
        map.set(it.permissionKey, {
          permissionKey: it.permissionKey,
          label: it.label,
          path: it.path,
          icon: it.icon,
          isSection: it.children !== undefined && it.children.length > 0,
        });
      }
      if (it.children) walk(it.children);
    }
  };
  walk(items);
  return map;
}

export function findDuplicateValues(values: string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) dupes.add(v);
    seen.add(v);
  }
  return [...dupes];
}
