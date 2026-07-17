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
