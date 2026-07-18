import type mysql from 'mysql2/promise';

export interface IBookingRepository {
  findById(id: number): Promise<{
    id: number;
    user_id: number;
    organisation_id: number | null;
    branch_id: number | null;
    resource_id: number;
    booking_status: string;
    payment_status: string;
    payment_method: string | null;
    booking_type?: string;
  } | null>;

  persistTransition(
    bookingId: number,
    status: string,
    paymentStatus?: string,
    paymentMethod?: string,
    conn?: mysql.PoolConnection,
  ): Promise<void>;

  persistPaymentStatus(
    bookingId: number,
    paymentStatus: string,
    conn?: mysql.PoolConnection,
  ): Promise<void>;

  releaseSlots(
    bookingId: number,
    conn?: mysql.PoolConnection,
  ): Promise<void>;

  lockSlots(
    bookingId: number,
    conn?: mysql.PoolConnection,
  ): Promise<void>;

  createCancellation(
    bookingId: number,
    actorId: number,
    reason: string,
    feeAmount: number,
    conn?: mysql.PoolConnection,
  ): Promise<void>;
}
