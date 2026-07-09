import type { PlatformContract } from './base/PlatformContract.js';
import type { PaginatedResult, PaginationInput } from '../shared/types.js';
import type {
  PaymentItem, TransactionItem, WalletBalance,
  PaymentFilters, PaymentStatus, RefundStatus,
} from '../shared/payment-types.js';

export interface PaymentPlatform extends PlatformContract {
  getPayment(paymentId: number): Promise<PaymentItem | null>;

  getTransaction(transactionId: number): Promise<TransactionItem | null>;

  list(
    userId: number,
    pagination?: PaginationInput,
    filters?: PaymentFilters,
  ): Promise<PaginatedResult<PaymentItem>>;

  getPaymentStatus(paymentId: number): Promise<PaymentStatus | null>;

  getWalletBalance(userId: number): Promise<WalletBalance | null>;

  getRefundStatus(paymentId: number): Promise<RefundStatus | null>;
}
