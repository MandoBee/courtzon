# ADR-0007: Wallet & Payment Architecture

## Status

Accepted

## Context

CourtZon handles financial transactions in multiple contexts:

- **Booking payments** — users pay for court bookings (card via Paymob, wallet, cash, COD)
- **Marketplace payments** — users buy products from sellers
- **Wallet** — users maintain a balance for deposits and withdrawals
- **Payouts** — organisations receive settlements for bookings
- **Coaching sessions** — users pay coaches for sessions
- **Tournament fees** — users pay entry fees

Each payment context has different requirements for:
- Payment method support (card, wallet, cash, COD, points)
- Fee calculation (commission, platform fee, VAT)
- Settlement timing (immediate for wallet, delayed for card)
- Refund policies
- Integration with the booking lifecycle

## Decision

Build a **unified payment processing pipeline** with the following components:

**1. Payment Gateway abstraction**

```typescript
interface PaymentGateway {
  charge(request: PaymentRequest): Promise<PaymentResult>;
  refund(request: RefundRequest): Promise<RefundResult>;
  verifyWebhook(payload: unknown, signature: string): boolean;
  getTransactionStatus(gatewayRef: string, orderId?: string): Promise<...>;
}
```

Implemented by:
- `PaymobGateway` — production gateway using Paymob's Intention API
- `MockGateway` — development/testing gateway that always succeeds

**2. Single payment outcome processor**

`_processPaymentOutcome()` is the canonical method called by all entry points:
- Webhook handler
- Payment sync job (polls Paymob for stuck payments)
- Manual recovery endpoint (admin-triggered)
- Confirmation callback

This method:
- Updates `payment_transactions` status with optimistic locking
- Emits domain events (`payment:succeeded`, `payment:failed-event`, `payment:completed`, `payment:failed`)
- Creates financial journal entries
- Is fully idempotent (repeated calls with the same status are no-ops)

**3. Reference type pattern**

Every payment transaction has a `reference_type` field that identifies the source context: `booking`, `booking_prepare`, `order`, `wallet_deposit`, etc. This enables the payment pipeline to be context-agnostic while downstream consumers (booking listener, marketplace listener) filter by reference type.

**4. Wallet as a separate aggregate**

The wallet is a separate aggregate with its own:
- Balance tracking with optimistic concurrency
- Transaction history (`wallet_transactions`)
- Deposit/withdrawal flows that go through the payment pipeline

**5. Settlement system**

Settlements aggregate payments over a period and trigger payouts to organisations. The settlement lifecycle is independent of individual payment processing.

## Consequences

**Benefits:**
- Unified payment pipeline handles all payment contexts consistently
- Single `_processPaymentOutcome` method ensures all code paths produce the same events and journal entries
- Reference type pattern keeps the payment module decoupled from booking, marketplace, and wallet modules
- Gateway abstraction enables testing with MockGateway and switching providers without changing business logic
- Idempotency guarantees safe webhook retries and recovery operations

**Trade-offs:**
- The wallet deposit flow has a gap: `deposit()` calls `paymentGateway.charge()` synchronously, but Paymob's Intention API always returns `pending` status. The webhook that confirms the payment cannot find the `payment_transactions` row because it was created with a different reference. This is a known limitation documented but not yet fixed.
- The payment pipeline is complex — multiple entry points (webhook, sync, recovery, confirm) all converge on the same processor, which can make debugging challenging.

**Alternatives rejected:**
- *Separate payment handlers per context*: Would lead to duplicated code and inconsistent event emission
- *Transaction-only without wallet*: Users need a stored balance for faster checkout and wallet-specific promotions
- *Direct gateway calls from each module*: Would couple every module to Paymob's API and make testing difficult

**Future considerations:**
- The wallet top-up gap should be addressed (see `docs/payment/wallet-topup-gap.md`)
- Additional payment gateways (Fawry, Kiosk) should implement the same `PaymentGateway` interface
- The settlement system should be extended to support automatic payouts to bank accounts
- Consider adding a `payment:refund-requested` event for manual refund workflows
