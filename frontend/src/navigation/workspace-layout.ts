import type { WorkspaceNode } from './types';

export interface WorkspaceLayoutRow {
  parentKey: string | null;
  orderedKeys: string[];
}

export function buildContainerKeys(items: WorkspaceNode[]): Set<string> {
  const keys = new Set<string>();
  function walk(list: WorkspaceNode[]) {
    for (const it of list) {
      if (it.children && it.children.length > 0) {
        keys.add(it.permissionKey);
        walk(it.children);
      }
    }
  }
  walk(items);
  return keys;
}

export function buildDefaultContainers(items: WorkspaceNode[]): Map<string | null, string[]> {
  const map = new Map<string | null, string[]>();
  function walk(list: WorkspaceNode[], parentKey: string | null) {
    const keys = list.map((it: WorkspaceNode) => it.permissionKey);
    map.set(parentKey, keys);
    for (const it of list) {
      if (it.children && it.children.length > 0) {
        walk(it.children, it.permissionKey);
      }
    }
  }
  walk(items, null);
  return map;
}

export function serializeContainers(containers: Map<string | null, string[]>): WorkspaceLayoutRow[] {
  return Array.from(containers.entries()).map(([parentKey, orderedKeys]) => ({
    parentKey,
    orderedKeys,
  }));
}

export function mergeSavedLayout(
  current: Map<string | null, string[]>,
  rows: WorkspaceLayoutRow[],
  validKeys: Set<string>,
): Map<string | null, string[]> {
  const saved = new Map<string | null, string[]>();
  for (const entry of rows) {
    const existing = entry.orderedKeys.filter((k) => validKeys.has(k));
    if (existing.length) saved.set(entry.parentKey, existing);
  }
  if (saved.size === 0) return current;
  const next = new Map<string | null, string[]>(current);
  for (const [parentKey, savedKeys] of saved) {
    const defaults = current.get(parentKey) ?? [];
    const seen = new Set<string>();
    const ordered = savedKeys.filter((k: string) => defaults.includes(k) && !seen.has(k) && !!seen.add(k));
    const remaining = defaults.filter((k) => !savedKeys.includes(k));
    next.set(parentKey, [...ordered, ...remaining]);
  }
  return next;
}
