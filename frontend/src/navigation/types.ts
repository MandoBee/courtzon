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
  /**
   * Additional (AND) permission that must ALSO be granted for the item to be
   * rendered.
   *
   * `permissionKey` selects the nav owner / layout key (which also drives the
   * admin Permissions screen), while `requiresPermission` expresses an
   * API-side authority the surface cannot work without. Example: the admin
   * Inventory module is gated in the sidebar by `sidebar.inventory`, but every
   * `/admin/inventory/*` endpoint requires `platform.admin` on the backend, so
   * both must be held before the menu may be shown.
   */
  requiresPermission?: string;
  requiredFlag?: string;
  featureFlag?: string;
  children?: NavDefinition[];
}

export interface ResolvedNavItem {
  id: string;
  label: string;
  icon?: string;
  path: string;
  permissionKey?: string;
  requiresPermission?: string;
  requiredFlag?: string;
  featureFlag?: string;
  badgeCount?: number;
  children?: ResolvedNavItem[];
}

export interface PlayerCoreTabDef {
  id: string;
  label: NavLabel;
  icon: string;
  path: string;
  /** Red notification badge (count derived from the authoritative nav-summary endpoint). */
  badgeCount?: number;
}

export interface PlayerMoreItemDef {
  id: string;
  label: NavLabel;
  icon: string;
  path: string;
  permissionKey?: string;
  featureFlag?: string;
  sellerOnly?: boolean;
  /** Red notification badge (count derived from the authoritative nav-summary endpoint). */
  badgeCount?: number;
}

export type ShellKey = 'admin' | 'org' | 'coach' | 'referee' | 'player' | 'workspace';

export interface WorkspaceNode {
  id: string;
  label: string;
  icon: string;
  path: string;
  permissionKey: string;
  requiredFlag?: string;
  children?: WorkspaceNode[];
}
