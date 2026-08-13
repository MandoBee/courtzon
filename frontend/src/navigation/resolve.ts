import type { NavDefinition, ResolvedNavItem, PlayerCoreTabDef, PlayerMoreItemDef, WorkspaceNode } from './types';
import { resolveLabel } from './labels';
import { composeFilters, sellerFilter, permissionFilter, featureFlagFilter, type NavFilterContext } from './pipeline';
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
    id: item.id,
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
    function applySavedLayout(list: NavDefinition[]) {
      for (const section of list) {
        const order = savedLayout!.get(section.id) ?? savedLayout!.get(section.permissionKey ?? '');
        if (order && section.children) {
          const ordered = order.map((k) => findByIdOrKey(section.children!, k)).filter(Boolean) as NavDefinition[];
          const remaining = section.children.filter(
            (c) => c.permissionKey !== undefined && !order.includes(c.permissionKey) && !order.includes(c.id),
          );
          section.children = [...ordered, ...remaining];
        }
        if (section.children) applySavedLayout(section.children);
      }
    }
    applySavedLayout(items);
  }

  const filterItem = (item: NavDefinition): ResolvedNavItem | null => {
    if (item.requiredFlag && !flag(item.requiredFlag)) return null;
    if (item.children && item.children.length > 0) {
      const filteredChildren = item.children
        .map((c) => filterItem(c))
        .filter((c): c is ResolvedNavItem => c !== null);
      if (filteredChildren.length === 0) return null;
      return {
        id: item.id,
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
      id: item.id,
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
  const filterItem = (item: NavDefinition): ResolvedNavItem | null => {
    if (item.requiredFlag) return null; // org nav has no feature-flag gating currently
    if (item.children && item.children.length > 0) {
      const children = item.children
        .map((c) => filterItem(c))
        .filter((c): c is ResolvedNavItem => c !== null);
      if (children.length === 0) return null;
      return {
        id: item.id,
        label: resolveLabel(item.label, t),
        icon: item.icon,
        path: item.path.replace('{orgId}', orgId),
        ...(item.permissionKey !== undefined ? { permissionKey: item.permissionKey } : {}),
        children: children.map((c) => ({ ...c, path: c.path.replace('{orgId}', orgId) })),
      };
    }
    if (item.permissionKey !== undefined && !can(item.permissionKey)) return null;
    return {
      id: item.id,
      label: resolveLabel(item.label, t),
      icon: item.icon as string,
      path: item.path.replace('{orgId}', orgId),
      permissionKey: item.permissionKey as string,
    };
  };

  return ORG_NAV.map(filterItem).filter((i): i is ResolvedNavItem => i !== null);
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

export const PLAYER_CORE_PIPELINE = composeFilters<PlayerCoreTabDef>();

export const PLAYER_MORE_PIPELINE = composeFilters<PlayerMoreItemDef>(sellerFilter, permissionFilter, featureFlagFilter);

export function projectPlayerCoreTabs(items: PlayerCoreTabDef[], t: (key: string) => string): ResolvedNavItem[] {
  return items.map((item) => toResolved(item, t));
}

export function projectPlayerMoreItems(items: PlayerMoreItemDef[], t: (key: string) => string): ResolvedNavItem[] {
  return items.map((item) => toResolved(item, t));
}

export function resolvePlayerCoreTabs(t: (key: string) => string): ResolvedNavItem[] {
  const ctx: NavFilterContext = { can: () => true, flags: {}, isSeller: true };
  return projectPlayerCoreTabs(PLAYER_CORE_PIPELINE(PLAYER_CORE_TABS, ctx), t);
}

export function resolvePlayerMoreItems(t: (key: string) => string, opts: PlayerMoreOptions): ResolvedNavItem[] {
  const { isSeller, chatEnabled, can } = opts;
  const ctx: NavFilterContext = { can, flags: { 'community.chat_enabled': chatEnabled }, isSeller };
  return projectPlayerMoreItems(PLAYER_MORE_PIPELINE(PLAYER_MORE_ITEMS, ctx), t);
}

export function resolveWorkspaceNav(t: (key: string) => string): WorkspaceNode[] {
  function convert(item: NavDefinition): WorkspaceNode {
    return {
      id: item.id,
      label: resolveLabel(item.label, t),
      icon: item.icon ?? '',
      path: item.path,
      permissionKey: item.permissionKey ?? item.id,
      ...(item.requiredFlag !== undefined ? { requiredFlag: item.requiredFlag } : {}),
      ...(item.children && item.children.length > 0
        ? { children: item.children.map(convert) }
        : {}),
    };
  }
  return ADMIN_NAV.map(convert);
}
