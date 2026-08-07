import type { NavDefinition } from './types';

export interface NavIdKeyMaps {
  idToKey: ReadonlyMap<string, string>;
  keyToIds: ReadonlyMap<string, string[]>;
}

export function buildNavIdKeyMaps(defs: NavDefinition[]): NavIdKeyMaps {
  const idToKey = new Map<string, string>();
  const keyToIds = new Map<string, string[]>();
  const walk = (list: NavDefinition[]) => {
    for (const d of list) {
      if (d.permissionKey !== undefined) {
        idToKey.set(d.id, d.permissionKey);
        const ids = keyToIds.get(d.permissionKey) ?? [];
        ids.push(d.id);
        keyToIds.set(d.permissionKey, ids);
      }
      if (d.children) walk(d.children);
    }
  };
  walk(defs);
  return { idToKey, keyToIds };
}
