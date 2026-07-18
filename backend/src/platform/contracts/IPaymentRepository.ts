import type mysql from 'mysql2/promise';

export interface IPaymentRepository {
  findById(id: number): Promise<any>;

  updateStatus(
    paymentId: number,
    status: string,
    gatewayReference?: string,
    conn?: mysql.PoolConnection,
  ): Promise<void>;

  expirePayment(
    paymentId: number,
    conn?: mysql.PoolConnection,
  ): Promise<boolean>;
}
