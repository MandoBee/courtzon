export type PaymentStatus = 'created' | 'pending' | 'processing' | 'paid' | 'failed' | 'cancelled' | 'expired' | 'refunded';

export type RefundStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type PaymentMethod = 'card' | 'wallet' | 'cash' | 'cod' | 'bank_transfer' | 'online';

export interface PaymentItem {
  id: number;
  userId: number;
  bookingId: number | null;
  orderId: number | null;
  referenceType: string | null;
  paymentMethod: string;
  gatewayProvider: string;
  gatewayReference: string;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  createdAt: string;
  paidAt: string | null;
}

export interface TransactionItem {
  id: number;
  userId: number;
  type: string;
  sourceType: string;
  sourceId: number;
  amount: number;
  balance: number;
  currency: string;
  description: string | null;
  createdAt: string;
}

export interface WalletBalance {
  balance: number;
  currency: string;
  version: number;
}

export interface PaymentFilters {
  status?: string;
  fromDate?: string;
  toDate?: string;
  referenceType?: string;
  page?: number;
  limit?: number;
}
