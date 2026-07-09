import type { PlatformContract } from './base/PlatformContract.js';
import type { PaginatedResult, PaginationInput } from '../shared/types.js';
import type { BookingItem, BookingFilters, SlotInfo, BookingStatusResult, PaymentStatusResult } from '../shared/booking-types.js';

export interface BookingPlatform extends PlatformContract {
  getBooking(bookingId: number): Promise<BookingItem | null>;

  list(
    userId: number,
    pagination?: PaginationInput,
    filters?: BookingFilters,
  ): Promise<PaginatedResult<BookingItem>>;

  getAvailability(
    resourceId: number,
    date: string,
  ): Promise<SlotInfo[]>;

  getBookingStatus(bookingId: number): Promise<BookingStatusResult | null>;

  getPaymentStatus(bookingId: number): Promise<PaymentStatusResult | null>;
}
