export interface NotificationType {
  id: number;
  code: string;
  event_key: string;
  name: string;
  description: string | null;
  category: string;
  priority: 'low' | 'normal' | 'high' | 'critical';
  default_channels: string[];
  icon: string | null;
  enabled: boolean;
  requires_action: boolean;
  system_managed: boolean;
  sort_order: number;
  created_by: number | null;
  updated_by: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type NotificationTypePriority = 'low' | 'normal' | 'high' | 'critical';

export type NotificationTypeFilters = {
  q?: string;
  category?: string;
  enabled?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'sort_order' | 'created_at';
  sort_order?: 'asc' | 'desc';
};
