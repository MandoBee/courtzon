import type { NavDefinition, ResolvedNavItem, PlayerCoreTabDef, PlayerMoreItemDef } from './types';
import { resolveLabel } from './labels';
import { ADMIN_NAV } from './admin.registry';
import { ORG_NAV } from './org.registry';
import { COACH_NAV } from './coach.registry';
import { REFEREE_NAV } from './referee.registry';
import { PLAYER_CORE_TABS, PLAYER_MORE_ITEMS } from './player.registry';

function cloneDefs(defs: NavDefinition[]): NavDefinition[] {
  return defs.map((d) => ({ ...d, children: d.children ? cloneDefs(d.children) : undefined }));
}

function toResolved(
  item: NavDefinition,
  t: (key: string) => string,
  opts: { includeChildren: boolean } = { includeChildren: false },
): ResolvedNavItem {
  const resolved: ResolvedNavItem = {
    label: resolveLabel(item.label, t),
    path: item.path,
  };
  if (item.icon !== undefined) resolved.icon = item.icon;
  if (item.permissionKey !== undefined) resolved.permissionKey = item.permissionKey;
  if (item.requiredFlag !== undefined) resolved.requiredFlag = item.requiredFlag;
  if (item.featureFlag !== undefined) resolved.featureFlag = item.featureFlag;
  if (opts.includeChildren && item.children) resolved.children = item.children.map((c) => toResolved(c, t, { includeChildren: true }));
  return resolved;
}

function findByIdOrKey(nodes: NavDefinition[], keyOrId: string): NavDefinition | undefined {
  return nodes.find((n) => n.id === keyOrId || n.permissionKey === keyOrId);
}

export function resolveAdminNav(
  t: (key: string) => string,
  can: (perm: string) => boolean,
  flag: (key: string) => boolean,
  savedLayout?: Map<string | null, string[]>,
): ResolvedNavItem[] {
  const items = cloneDefs(ADMIN_NAV);

  if (savedLayout) {
    const leaf = items.filter((i) => !i.children);
    const sections = items.filter((i) => i.children);
    const topOrder = savedLayout.get(null);
    if (topOrder) {
      const orderedLeaf = topOrder.map((k) => findByIdOrKey(leaf, k)).filter(Boolean) as NavDefinition[];
      const remainingLeaf = leaf.filter(
        (i) => i.permissionKey !== undefined && !topOrder.includes(i.permissionKey) && !topOrder.includes(i.id),
      );
      items.length = 0;
      items.push(...orderedLeaf, ...sections, ...remainingLeaf);
    }
    for (const section of sections) {
      const order = savedLayout.get(section.id) ?? savedLayout.get(section.permissionKey ?? '');
      if (order && section.children) {
        const ordered = order.map((k) => findByIdOrKey(section.children!, k)).filter(Boolean) as NavDefinition[];
        const remaining = section.children.filter(
          (c) => c.permissionKey !== undefined && !order.includes(c.permissionKey) && !order.includes(c.id),
        );
        section.children = [...ordered, ...remaining];
      }
    }
  }

  const filterItem = (item: NavDefinition): ResolvedNavItem | null => {
    if (item.requiredFlag && !flag(item.requiredFlag)) return null;
    if (item.children && item.children.length > 0) {
      const filteredChildren = item.children
        .map((c) => filterItem(c))
        .filter((c): c is ResolvedNavItem => c !== null);
      if (filteredChildren.length === 0) return null;
      return {
        label: resolveLabel(item.label, t),
        path: item.path,
        ...(item.icon !== undefined ? { icon: item.icon } : {}),
        ...(item.permissionKey !== undefined ? { permissionKey: item.permissionKey } : {}),
        ...(item.requiredFlag !== undefined ? { requiredFlag: item.requiredFlag } : {}),
        children: filteredChildren,
      };
    }
    if (item.permissionKey !== undefined && !can(item.permissionKey)) return null;
    return {
      label: resolveLabel(item.label, t),
      path: item.path,
      ...(item.icon !== undefined ? { icon: item.icon } : {}),
      ...(item.permissionKey !== undefined ? { permissionKey: item.permissionKey } : {}),
      ...(item.requiredFlag !== undefined ? { requiredFlag: item.requiredFlag } : {}),
    };
  };

  return items.map(filterItem).filter((i): i is ResolvedNavItem => i !== null);
}

export function resolveOrgNav(can: (perm: string) => boolean, orgId: string, t: (key: string) => string): ResolvedNavItem[] {
  return ORG_NAV.map((item) => ({
    label: resolveLabel(item.label, t),
    icon: item.icon as string,
    path: item.path.replace('{orgId}', orgId),
    permissionKey: item.permissionKey as string,
  })).filter((item) => can(item.permissionKey as string));
}

export function resolveCoachNav(t: (key: string) => string): ResolvedNavItem[] {
  return COACH_NAV.map((item) => toResolved(item, t));
}

export function resolveRefereeNav(can: (perm: string) => boolean, t: (key: string) => string): ResolvedNavItem[] {
  return REFEREE_NAV.filter((item) => !item.permissionKey || can(item.permissionKey)).map((item) => toResolved(item, t));
}

export interface PlayerMoreOptions {
  isSeller: boolean;
  chatEnabled: boolean;
  can: (perm: string) => boolean;
}

export function resolvePlayerCoreTabs(t: (key: string) => string): ResolvedNavItem[] {
  return PLAYER_CORE_TABS.map((item: PlayerCoreTabDef) => ({
    label: resolveLabel(item.label, t),
    icon: item.icon,
    path: item.path,
  }));
}

export function resolvePlayerMoreItems(t: (key: string) => string, opts: PlayerMoreOptions): ResolvedNavItem[] {
  const { isSeller, chatEnabled, can } = opts;
  const flags: Record<string, boolean> = { 'community.chat_enabled': chatEnabled };
  return PLAYER_MORE_ITEMS.filter((item) => !item.sellerOnly || isSeller)
    .map((item: PlayerMoreItemDef) => ({
      label: resolveLabel(item.label, t),
      icon: item.icon,
      path: item.path,
      ...(item.permissionKey !== undefined ? { permissionKey: item.permissionKey } : {}),
      ...(item.featureFlag !== undefined ? { featureFlag: item.featureFlag } : {}),
    }))
    .filter((item) => {
      if (item.permissionKey && !can(item.permissionKey)) return false;
      if (item.featureFlag && !flags[item.featureFlag]) return false;
      return true;
    });
}
