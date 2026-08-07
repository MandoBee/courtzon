export type LabelPart =
  | { kind: 't'; key: string }
  | { kind: 'lit'; text: string };

export type NavLabel = LabelPart | { kind: 'composite'; parts: LabelPart[] };

export interface NavDefinition {
  id: string;
  label: NavLabel;
  icon?: string;
  path: string;
  permissionKey?: string;
  requiredFlag?: string;
  featureFlag?: string;
  children?: NavDefinition[];
}

export interface ResolvedNavItem {
  label: string;
  icon?: string;
  path: string;
  permissionKey?: string;
  requiredFlag?: string;
  featureFlag?: string;
  children?: ResolvedNavItem[];
}

export interface PlayerCoreTabDef {
  id: string;
  label: NavLabel;
  icon: string;
  path: string;
}

export interface PlayerMoreItemDef {
  id: string;
  label: NavLabel;
  icon: string;
  path: string;
  permissionKey?: string;
  featureFlag?: string;
  sellerOnly?: boolean;
}

export type ShellKey = 'admin' | 'org' | 'coach' | 'referee' | 'player';
