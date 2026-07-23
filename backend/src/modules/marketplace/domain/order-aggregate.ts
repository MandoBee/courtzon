export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';

export type OrderRole = 'buyer' | 'seller' | 'admin';

const ALLOWED_TRANSITIONS: Record<OrderStatus, Record<OrderRole, OrderStatus[]>> = {
  pending: {
    buyer: ['cancelled'],
    seller: ['processing', 'cancelled'],
    admin: ['confirmed', 'cancelled'],
  },
  confirmed: {
    buyer: ['cancelled'],
    seller: ['processing', 'cancelled'],
    admin: ['processing', 'cancelled'],
  },
  processing: {
    buyer: ['cancelled'],
    seller: ['shipped'],
    admin: ['shipped', 'cancelled'],
  },
  shipped: {
    buyer: ['delivered'],
    seller: ['delivered'],
    admin: ['delivered', 'cancelled'],
  },
  delivered: {
    buyer: ['refunded'],
    seller: [],
    admin: ['refunded'],
  },
  cancelled: {
    buyer: [], seller: [], admin: [],
  },
  refunded: {
    buyer: [], seller: [], admin: [],
  },
};

export interface OrderRecord {
  order_status: OrderStatus;
  aggregate_version: number;
}

export interface TransitionRequest {
  fromStatus: OrderStatus;
  toStatus: OrderStatus;
  role: OrderRole;
  currentVersion: number;
}

export interface TransitionResult {
  newVersion: number;
  didTransition: boolean;
}

export function assertValidTransition(from: OrderStatus, to: OrderStatus, role: OrderRole): void {
  const allowed = ALLOWED_TRANSITIONS[from]?.[role];
  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Illegal order state transition: ${from} → ${to} as ${role}`);
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return ['cancelled', 'refunded'].includes(status);
}

export function planTransition(request: TransitionRequest): TransitionResult {
  assertValidTransition(request.fromStatus, request.toStatus, request.role);
  return { newVersion: request.currentVersion + 1, didTransition: true };
}
