export type ElementType = 'button' | 'tab' | 'page' | 'section' | 'action' | 'field';

export interface UIElement {
  permissionKey: string;
  moduleSlug: string;
  elementType: ElementType;
  elementLabel: string;
  componentPath?: string;
}

export interface UIPermission extends UIElement {
  id: number;
  moduleId: number;
  roles: { role_id: number; role_name: string; role_slug: string; has_permission: boolean }[];
}
