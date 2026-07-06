import type { DomainEventMap, DomainEventName } from '../../../shared/event-bus/index.js';

export interface NotificationTemplate {
  categorySlug: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'reminder';
  priority: 'low' | 'normal' | 'high' | 'critical';
  title: string | ((data: any) => string);
  body: string | ((data: any) => string);
  actionKey: string;
  routePattern: string;
  resolveRecipients: (data: any) => Array<{ userId: number; organisationId?: number; branchId?: number }>;
  resolveRelatedEntity?: (data: any) => { type: string; id: string } | null;
}

export function getTemplate(event: string): NotificationTemplate | null {
  const template = rules[event];
  return template || null;
}

export function formatTitle(template: NotificationTemplate, data: any): string {
  return typeof template.title === 'function' ? template.title(data) : template.title;
}

export function formatBody(template: NotificationTemplate, data: any): string {
  return typeof template.body === 'function' ? template.body(data) : template.body;
}

export function formatActionPayload(template: NotificationTemplate, data: any): Record<string, any> {
  const params: Record<string, any> = {};
  const pattern = template.routePattern;
  const matches = pattern.match(/:(\w+)/g);
  if (matches) {
    for (const m of matches) {
      const key = m.slice(1);
      params[key] = (data as any)[key] ?? null;
    }
  }
  return params;
}

const rules: Partial<Record<string, NotificationTemplate>> = {
  'booking:created': {
    categorySlug: 'bookings',
    type: 'info',
    priority: 'normal',
    title: 'New Booking Created',
    body: (d: DomainEventMap['booking:created']) =>
      `Your booking #${d.bookingId} has been created successfully.`,
    actionKey: 'view_booking',
    routePattern: '/bookings/:bookingId',
    resolveRecipients: (d: DomainEventMap['booking:created']) => [
      { userId: d.userId, organisationId: d.organisationId, branchId: d.branchId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['booking:created']) => ({ type: 'booking', id: String(d.bookingId) }),
  },

  'booking:confirmed': {
    categorySlug: 'bookings',
    type: 'success',
    priority: 'high',
    title: 'Booking Confirmed',
    body: (d: DomainEventMap['booking:confirmed']) =>
      `Booking #${d.bookingId} has been confirmed.`,
    actionKey: 'view_booking',
    routePattern: '/bookings/:bookingId',
    resolveRecipients: (d: DomainEventMap['booking:confirmed']) => [
      { userId: d.userId, organisationId: d.organisationId, branchId: d.branchId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['booking:confirmed']) => ({ type: 'booking', id: String(d.bookingId) }),
  },

  'booking:cancelled': {
    categorySlug: 'bookings',
    type: 'warning',
    priority: 'high',
    title: 'Booking Cancelled',
    body: (d: DomainEventMap['booking:cancelled']) =>
      `Booking #${d.bookingId} has been cancelled${d.reason ? `: ${d.reason}` : ''}.`,
    actionKey: 'view_booking',
    routePattern: '/bookings/:bookingId',
    resolveRecipients: (d: DomainEventMap['booking:cancelled']) => [
      { userId: d.userId, organisationId: d.organisationId, branchId: d.branchId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['booking:cancelled']) => ({ type: 'booking', id: String(d.bookingId) }),
  },

  'booking:expired': {
    categorySlug: 'bookings',
    type: 'warning',
    priority: 'normal',
    title: 'Booking Expired',
    body: (d: DomainEventMap['booking:expired']) =>
      `Booking #${d.bookingId} has expired.`,
    actionKey: 'view_booking',
    routePattern: '/bookings/:bookingId',
    resolveRecipients: (d: DomainEventMap['booking:expired']) => [
      { userId: d.userId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['booking:expired']) => ({ type: 'booking', id: String(d.bookingId) }),
  },

  'payment:completed': {
    categorySlug: 'payments',
    type: 'success',
    priority: 'high',
    title: 'Payment Completed',
    body: (d: DomainEventMap['payment:completed']) =>
      `Payment of ${d.currency} ${d.amount.toFixed(2)} via ${d.gateway} completed successfully.`,
    actionKey: 'view_payment',
    routePattern: '/payments/:paymentId',
    resolveRecipients: (d: DomainEventMap['payment:completed']) => [
      { userId: d.userId, organisationId: d.organisationId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['payment:completed']) => ({ type: 'payment', id: String(d.paymentId) }),
  },

  'payment:failed': {
    categorySlug: 'payments',
    type: 'error',
    priority: 'high',
    title: 'Payment Failed',
    body: (d: DomainEventMap['payment:failed']) =>
      `Payment of ${d.currency} ${d.amount.toFixed(2)} failed: ${d.error}`,
    actionKey: 'view_payment',
    routePattern: '/payments/:paymentId',
    resolveRecipients: (d: DomainEventMap['payment:failed']) => [
      { userId: d.userId, organisationId: d.organisationId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['payment:failed']) => ({ type: 'payment', id: String(d.paymentId) }),
  },

  'payment:refunded': {
    categorySlug: 'payments',
    type: 'info',
    priority: 'normal',
    title: 'Payment Refunded',
    body: (d: DomainEventMap['payment:refunded']) =>
      `Refund of ${d.amount.toFixed(2)} has been processed for payment #${d.paymentId}.`,
    actionKey: 'view_payment',
    routePattern: '/payments/:paymentId',
    resolveRecipients: (d: DomainEventMap['payment:refunded']) => [
      { userId: d.userId, organisationId: d.organisationId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['payment:refunded']) => ({ type: 'payment', id: String(d.paymentId) }),
  },

  'marketplace:order-placed': {
    categorySlug: 'marketplace',
    type: 'info',
    priority: 'normal',
    title: 'New Order Placed',
    body: (d: DomainEventMap['marketplace:order-placed']) =>
      `Order #${d.orderId} has been placed (${d.total.toFixed(2)}).`,
    actionKey: 'view_order',
    routePattern: '/marketplace/orders/:orderId',
    resolveRecipients: (d: DomainEventMap['marketplace:order-placed']) => [
      { userId: d.userId },
      { userId: d.sellerId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['marketplace:order-placed']) => ({ type: 'order', id: String(d.orderId) }),
  },

  'marketplace:order-status-changed': {
    categorySlug: 'marketplace',
    type: 'info',
    priority: 'normal',
    title: 'Order Status Updated',
    body: (d: any) =>
      `Order #${d.orderId} status changed to ${d.status}.`,
    actionKey: 'view_order',
    routePattern: '/marketplace/orders/:orderId',
    resolveRecipients: (d: any) => [
      { userId: d.userId },
    ],
    resolveRelatedEntity: (d: any) => ({ type: 'order', id: String(d.orderId) }),
  },

  'marketplace:new-review': {
    categorySlug: 'marketplace',
    type: 'info',
    priority: 'low',
    title: 'New Review Received',
    body: (d: DomainEventMap['marketplace:new-review']) =>
      `You received a ${d.rating}-star review on your product.`,
    actionKey: 'view_review',
    routePattern: '/marketplace/products/:productId',
    resolveRecipients: (d: DomainEventMap['marketplace:new-review']) => [
      { userId: d.reviewedUserId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['marketplace:new-review']) => ({ type: 'review', id: String(d.reviewId) }),
  },

  'user:registered': {
    categorySlug: 'system',
    type: 'info',
    priority: 'low',
    title: 'New User Registered',
    body: (d: DomainEventMap['user:registered']) =>
      `User ${d.email} has registered.`,
    actionKey: 'view_user',
    routePattern: '/admin/users/:userId',
    resolveRecipients: () => [],
    resolveRelatedEntity: (d: DomainEventMap['user:registered']) => ({ type: 'user', id: String(d.userId) }),
  },

  'user:approved': {
    categorySlug: 'system',
    type: 'success',
    priority: 'normal',
    title: 'Account Approved',
    body: (d: DomainEventMap['user:approved']) =>
      `Your account has been approved with role: ${d.role}.`,
    actionKey: 'view_dashboard',
    routePattern: '/app',
    resolveRecipients: (d: DomainEventMap['user:approved']) => [
      { userId: d.userId },
    ],
    resolveRelatedEntity: (d: DomainEventMap['user:approved']) => ({ type: 'user', id: String(d.userId) }),
  },

  'system:announcement': {
    categorySlug: 'system',
    type: 'info',
    priority: 'normal',
    title: (d: DomainEventMap['system:announcement']) => d.title,
    body: (d: DomainEventMap['system:announcement']) => d.body,
    actionKey: 'view_announcement',
    routePattern: '/app',
    resolveRecipients: (d: DomainEventMap['system:announcement']) => {
      if (d.targetUserId) return [{ userId: d.targetUserId }];
      return [];
    },
  },
};
