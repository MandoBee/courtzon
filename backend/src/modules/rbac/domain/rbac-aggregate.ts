export type RoleStatus = 'active' | 'inactive';
export type PermissionElementType = 'button' | 'tab' | 'page' | 'section' | 'action' | 'field';

export interface RoleRecord {
  id: number;
  organisation_id: number | null;
  name: string;
  slug: string;
  is_system: boolean;
  is_active: boolean;
  deleted_at: string | null;
  aggregate_version: number;
}

export interface PermissionRecord {
  id: number;
  module_id: number;
  permission_key: string;
  is_system: boolean;
  element_type: PermissionElementType | null;
  element_label: string | null;
  is_ui_element: boolean;
}

export interface AssignRoleRequest {
  userId: number;
  roleId: number;
  scopes?: Array<{ scopeType: string; scopeId: number }>;
}

export function isSystemRole(role: RoleRecord): boolean {
  return role.is_system;
}

export function canDeleteRole(role: RoleRecord): boolean {
  return !role.is_system && role.deleted_at === null;
}

export function canAssignPermission(role: RoleRecord): boolean {
  return role.is_active && role.deleted_at === null;
}
