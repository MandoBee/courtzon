export type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'completed' | 'cancelled' | 'cancelled_with_fee' | 'no_show' | 'checked_in' | 'expired';

export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded' | 'penalty' | 'expired';

export interface BookingItem {
  id: number;
  publicId: string;
  userId: number;
  organisationId: number | null;
  branchId: number | null;
  resourceId: number;
  resourceName: string | null;
  branchName: string | null;
  bookingType: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  totalAmount: string;
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  createdAt: string;
}

export interface BookingFilters {
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
}

export interface SlotInfo {
  start: string;
  end: string;
  date: string;
  status: 'available' | 'booked';
}

export interface BookingStatusResult {
  bookingStatus: BookingStatus;
  paymentStatus: PaymentStatus;
  bookingDate: string;
  startTime: string;
  endTime: string;
}

export interface PaymentStatusResult {
  paymentStatus: PaymentStatus;
  paymentMethod: string | null;
  totalAmount: string;
}

export const CancellationReason = {
  PAYMENT_SESSION_CREATION_FAILED: 'Payment session creation failed',
  PAYMENT_CANCELLED_BY_USER: 'Payment cancelled by user',
  PAYMENT_DECLINED: 'Payment declined',
  PAYMENT_TIMEOUT: 'Payment timeout',
  PAYMENT_GATEWAY_ERROR: 'Payment gateway error',
  SYSTEM_ERROR: 'System error',
  ADMIN_CANCELLED: 'Cancelled by admin',
  CUSTOMER_CANCELLED: 'Cancelled by customer',
  AUTO_CANCELLED_PAYMENT_TIMEOUT: 'Auto-cancelled: payment timeout',
  AUTO_CANCELLED_UNPAID: 'Auto-cancelled: unpaid',
  PARENT_DELETED: 'Auto-cancelled: parent deleted',
  COMPENSATION: 'Compensation: failed coach session',
  SESSION_DECLINED: 'Session declined',
} as const;

export type CancellationReasonValue = (typeof CancellationReason)[keyof typeof CancellationReason];
