export interface NavFilterContext {
  can: (perm: string) => boolean;
  flags: Record<string, boolean>;
  isSeller: boolean;
}

export interface NavGateable {
  permissionKey?: string;
  featureFlag?: string;
  requiredFlag?: string;
  sellerOnly?: boolean;
}

export type NavFilter<T> = (items: T[], ctx: NavFilterContext) => T[];

export function composeFilters<T>(...stages: NavFilter<T>[]): NavFilter<T> {
  return (items, ctx) => stages.reduce((acc, stage) => stage(acc, ctx), items);
}

export function sellerFilter<T>(items: T[], ctx: NavFilterContext): T[] {
  return items.filter((i) => {
    const g = i as Partial<NavGateable>;
    return g.sellerOnly === undefined || !g.sellerOnly || ctx.isSeller;
  });
}

export function permissionFilter<T>(items: T[], ctx: NavFilterContext): T[] {
  return items.filter((i) => {
    const g = i as Partial<NavGateable>;
    return g.permissionKey === undefined || ctx.can(g.permissionKey);
  });
}

export function featureFlagFilter<T>(items: T[], ctx: NavFilterContext): T[] {
  return items.filter((i) => {
    const g = i as Partial<NavGateable>;
    return g.featureFlag === undefined || ctx.flags[g.featureFlag] === true;
  });
}

export function requiredFlagFilter<T>(items: T[], ctx: NavFilterContext): T[] {
  return items.filter((i) => {
    const g = i as Partial<NavGateable>;
    return g.requiredFlag === undefined || ctx.flags[g.requiredFlag] === true;
  });
}
