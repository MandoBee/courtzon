import type { NotificationAction } from './notification-action.js';

export interface NotificationDto {
  id: number;
  title: string;
  body?: string | null;
  icon?: string | null;
  type?: string | null;
  priority?: string | null;
  category_slug?: string | null;
  created_at: string;
  is_read?: boolean;
  action_key?: string | null;
  action_payload?: Record<string, unknown> | null;
  action?: NotificationAction | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
}
