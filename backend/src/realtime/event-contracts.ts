/**
 * Event Contracts — Zod schemas for every Socket.IO event payload.
 * Every event must match its schema before broadcasting.
 */
import { z } from 'zod';

const positiveId = z.number().int().positive();
const timestamp = z.string().datetime().optional();

export const BookingCreatedV1 = z.object({
  bookingId: positiveId,
  userId: positiveId,
  organisationId: positiveId.optional(),
  branchId: positiveId.optional(),
  bookingType: z.string().optional(),
  timestamp,
  version: z.literal('1').optional(),
});

export const BookingConfirmedV1 = z.object({
  bookingId: positiveId,
  userId: positiveId,
  organisationId: positiveId.optional(),
  timestamp,
});

export const BookingCancelledV1 = z.object({
  bookingId: positiveId,
  userId: positiveId,
  organisationId: positiveId.optional(),
  timestamp,
});

export const BookingCompletedV1 = z.object({
  bookingId: positiveId,
  userId: positiveId,
  organisationId: positiveId.optional(),
  timestamp,
});

export const BookingExpiredV1 = z.object({
  bookingId: positiveId,
  userId: positiveId,
  timestamp,
});

export const MatchAvailableV1 = z.object({
  bookingId: positiveId,
  timestamp,
});

export const MatchRemovedV1 = z.object({
  bookingId: positiveId,
});

export const MatchInvitationV1 = z.object({
  userId: positiveId,
  bookingId: positiveId,
  senderId: positiveId.optional(),
  timestamp,
});

export const PaymentCompletedV1 = z.object({
  userId: positiveId,
  paymentId: positiveId.optional(),
  amount: z.number().optional(),
  gateway: z.string().optional(),
  timestamp,
});

export const PaymentFailedV1 = z.object({
  userId: positiveId,
  paymentId: positiveId.optional(),
  error: z.string().optional(),
  timestamp,
});

export const PaymentRefundedV1 = z.object({
  userId: positiveId,
  amount: z.number().optional(),
  timestamp,
});

export const WalletUpdatedV1 = z.object({
  type: z.string(),
  amount: z.number().optional(),
  timestamp,
});

export const OrderCreatedV1 = z.object({
  orderId: positiveId.optional(),
  userId: positiveId,
  sellerId: positiveId.optional(),
  timestamp,
});

export const OrderUpdatedV1 = z.object({
  status: z.enum(['shipped', 'delivered', 'cancelled']),
  userId: positiveId,
  sellerId: positiveId.optional(),
  timestamp,
});

export const DashboardUpdatedV1 = z.object({
  type: z.string(),
  amount: z.number().optional(),
  timestamp,
});

export const UserUpdatedV1 = z.object({
  status: z.string(),
  timestamp,
});

export const OrganisationApprovedV1 = z.object({
  userId: positiveId,
  organisationId: positiveId.optional(),
  timestamp,
});

export const OrganisationSubscriptionExpiringV1 = z.object({
  userId: positiveId,
  organisationId: positiveId.optional(),
  timestamp,
});

export const SecurityAccountLockedV1 = z.object({
  userId: positiveId,
  reason: z.string().optional(),
  timestamp,
});

export const PresenceV1 = z.object({
  userId: positiveId,
  timestamp,
});

export const CartUpdatedV1 = z.object({
  userId: positiveId,
  itemCount: z.number().optional(),
  timestamp,
});

export const WishlistUpdatedV1 = z.object({
  userId: positiveId,
  productId: positiveId.optional(),
  timestamp,
});

export const InventoryUpdatedV1 = z.object({
  productId: positiveId,
  quantity: z.number().optional(),
  timestamp,
});

export const MessageCreatedV1 = z.object({
  messageId: positiveId.optional(),
  conversationId: positiveId,
  senderId: positiveId,
  timestamp,
});

export const TypingV1 = z.object({
  conversationId: positiveId,
  userId: positiveId,
  timestamp,
});

export const ScoreUpdatedV1 = z.object({
  matchId: positiveId,
  score: z.string().optional(),
  timestamp,
});

export const AttendanceUpdatedV1 = z.object({
  sessionId: positiveId,
  userId: positiveId,
  status: z.string(),
  timestamp,
});

export const BadgeUpdatedV1 = z.object({
  count: z.number(),
  timestamp,
});

export const NotificationReadV1 = z.object({
  notificationId: positiveId,
  timestamp,
});

// Contract registry — maps event names to schemas
export const EVENT_CONTRACTS: Record<string, z.ZodTypeAny> = {
  'booking:created': BookingCreatedV1,
  'booking:confirmed': BookingConfirmedV1,
  'booking:cancelled': BookingCancelledV1,
  'booking:completed': BookingCompletedV1,
  'booking:expired': BookingExpiredV1,
  'match:available': MatchAvailableV1,
  'match:removed': MatchRemovedV1,
  'match:invitation': MatchInvitationV1,
  'payment:completed': PaymentCompletedV1,
  'payment:failed': PaymentFailedV1,
  'payment:refunded': PaymentRefundedV1,
  'wallet:updated': WalletUpdatedV1,
  'order:created': OrderCreatedV1,
  'order:updated': OrderUpdatedV1,
  'dashboard:updated': DashboardUpdatedV1,
  'user:updated': UserUpdatedV1,
  'organisation:approved': OrganisationApprovedV1,
  'organisation:subscription-expiring': OrganisationSubscriptionExpiringV1,
  'security:account-locked': SecurityAccountLockedV1,
  'presence:online': PresenceV1,
  'presence:offline': PresenceV1,
  'cart:updated': CartUpdatedV1,
  'wishlist:updated': WishlistUpdatedV1,
  'inventory:updated': InventoryUpdatedV1,
  'message:created': MessageCreatedV1,
  'typing:start': TypingV1,
  'typing:stop': TypingV1,
  'score:updated': ScoreUpdatedV1,
  'attendance:updated': AttendanceUpdatedV1,
  'badge:updated': BadgeUpdatedV1,
  'notification:read': NotificationReadV1,
};

export function validateEvent(event: string, data: unknown): { valid: boolean; data?: any; error?: string } {
  const schema = EVENT_CONTRACTS[event];
  if (!schema) return { valid: true }; // Unknown events pass through
  const result = schema.safeParse(data);
  if (!result.success) {
    return { valid: false, error: result.error.issues.map(i => i.message).join(', ') };
  }
  return { valid: true, data: result.data };
}
