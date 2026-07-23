export type NotificationPriority = 'critical' | 'high' | 'normal' | 'low';
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface DispatchRequest {
  userId: number;
  eventName: string;
  categorySlug: string;
  data: Record<string, unknown>;
  organisationId?: number;
  branchId?: number;
  relatedEntityType?: string;
  relatedEntityId?: string;
  senderId?: number;
  actionPayload?: Record<string, unknown>;
  actions?: unknown[];
  imageUrls?: Record<string, string>;
  digestable?: boolean;
  priority?: NotificationPriority;
  type?: NotificationType;
  locale?: string;
}

export interface ResolvedNotification {
  title: string;
  body: string | null;
  categorySlug: string;
  type: string;
  priority: string;
  actionKey: string | null;
  actions: unknown[] | null;
  imageUrls: Record<string, string> | undefined;
  templateId: number;
}

export interface DispatchResult {
  notificationId: number;
  userId: number;
}

export function categorizeEvent(eventName: string): string {
  if (eventName.startsWith('booking')) return 'bookings';
  if (eventName.startsWith('payment') || eventName.startsWith('wallet')) return 'payments';
  if (eventName.startsWith('marketplace')) return 'marketplace';
  return 'system';
}

export function shouldDispatch(rateCheck: { allowed: boolean }): boolean {
  return rateCheck.allowed;
}
