export type BookingStatus = 'pending' | 'pending_payment' | 'confirmed' | 'cancelled' | 'completed' | 'expired' | 'no-show' | 'check-in';

export interface BookingDto {
  id: number;
  userId: number;
  resourceId: number;
  bookingType: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  bookingStatus: BookingStatus;
  paymentStatus: string;
  totalAmount: number;
  createdAt: string;
}
